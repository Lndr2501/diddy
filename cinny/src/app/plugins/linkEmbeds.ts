/**
 * Link embeds under messages (#197, #198): direct image links are shown as the picture itself, other
 * links get a card with the page's OpenGraph data.
 *
 * Where the card's data comes from:
 * - Unencrypted rooms: the homeserver (`preview_url`), as before. When it has nothing (previews
 *   switched off on the server, page it cannot read), the app reads the page itself.
 * - Encrypted rooms: always the app itself, so the link never reaches the homeserver.
 *
 * The shells (Tauri on macOS, Electron on Linux) fetch the page, because most sites send no CORS
 * headers. This file only decides and parses, so it runs in the unit tests without a DOM.
 * The iOS app has the same rules in `ios/Diddy/Matrix/MessageEmbeds.swift`.
 */

/** File endings of pictures a web view can show. */
const IMAGE_PATH = /\.(png|jpe?g|gif|webp|avif|apng|bmp)$/i;

/** Hosts that serve pictures without a file ending (or with one that lies). */
const IMAGE_HOSTS = ['i.imgur.com', 'media.tenor.com', 'media.giphy.com', 'i.giphy.com', 'pbs.twimg.com'];

/**
 * Whether the app may fetch this host by itself. A link in a chat must not make the app talk to
 * the user's own network (router, NAS, `localhost`), so private addresses and local names are
 * left alone. The shells check this again before fetching.
 */
export const isPublicHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/\.(local|lan|home|internal|intranet|corp|home\.arpa)$/.test(host)) return false;
  if (!host.includes('.') && !host.includes(':')) return false;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (host.includes(':')) {
    if (host === '::' || host === '::1') return false;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return false;
    if (host.startsWith('::ffff:')) return false;
  }
  return true;
};

/** Whether the link points straight at a picture, so the picture itself can be shown. */
export const isImageLink = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (!isPublicHost(url.hostname)) return false;
  if (IMAGE_PATH.test(url.pathname)) return true;
  // Twitter pictures: /media/<id>?format=jpg
  if (url.hostname === 'pbs.twimg.com') return /^\/media\//.test(url.pathname);
  return IMAGE_HOSTS.includes(url.hostname) && /\.[a-z0-9]{3,4}$/i.test(url.pathname);
};

/** Whether the app may read this link's page for a card. */
export const isFetchableLink = (raw: string): boolean => {
  try {
    const url = new URL(raw);
    return (url.protocol === 'https:' || url.protocol === 'http:') && isPublicHost(url.hostname);
  } catch {
    return false;
  }
};

export type LinkMeta = {
  title?: string;
  description?: string;
  siteName?: string;
  /** Absolute http(s) URL of the page's preview picture. */
  image?: string;
  /** `theme-color` of the page, used as the card's accent stripe. */
  color?: string;
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });

const clean = (value: string | undefined, limit: number): string | undefined => {
  if (value === undefined) return undefined;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
};

/** The attributes of one tag, names lowercased. */
const attributes = (tag: string): Record<string, string> => {
  const found: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m = re.exec(tag);
  while (m) {
    found[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
    m = re.exec(tag);
  }
  return found;
};

const absoluteHttp = (value: string | undefined, base: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    if (!isPublicHost(url.hostname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
};

/** Only the head matters, and a huge page should not cost much. */
const HEAD_LIMIT = 512 * 1024;

/**
 * Reads a page's OpenGraph data (with the usual fallbacks: Twitter cards, `<title>`,
 * `<meta name="description">`). Undefined when the page has nothing worth a card.
 */
export const parseLinkMeta = (html: string, pageUrl: string): LinkMeta | undefined => {
  let head = html.slice(0, HEAD_LIMIT);
  const headEnd = head.search(/<\/head\s*>|<body[\s>]/i);
  if (headEnd > 0) head = head.slice(0, headEnd);

  const meta: Record<string, string> = {};
  const tagRe = /<meta\b[^>]*>/gi;
  let tag = tagRe.exec(head);
  while (tag) {
    const attrs = attributes(tag[0]);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content !== undefined && meta[key] === undefined) meta[key] = attrs.content;
    tag = tagRe.exec(head);
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const result: LinkMeta = {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? titleTag, 300),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta.description, 600),
    siteName: clean(meta['og:site_name'] ?? meta['application-name'], 100),
    image: absoluteHttp(
      meta['og:image'] ?? meta['og:image:url'] ?? meta['og:image:secure_url'] ?? meta['twitter:image'],
      pageUrl
    ),
  };
  const color = meta['theme-color']?.trim();
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) result.color = color;

  if (!result.title && !result.description && !result.image) return undefined;
  return result;
};

/** Turns the homeserver's `preview_url` answer into the same shape (the picture stays `mxc://`). */
export const metaFromServer = (prev: Record<string, unknown>): LinkMeta | undefined => {
  const text = (key: string, limit: number) => {
    const value = prev[key];
    return typeof value === 'string' ? clean(value, limit) : undefined;
  };
  const image = typeof prev['og:image'] === 'string' ? (prev['og:image'] as string) : undefined;
  const result: LinkMeta = {
    title: text('og:title', 300),
    description: text('og:description', 600),
    siteName: text('og:site_name', 100),
    image: image && /^(mxc|https?):\/\//.test(image) ? image : undefined,
  };
  if (!result.title && !result.description && !result.image) return undefined;
  return result;
};

/** Short host for the card's top line when the page names no site: `www.youtube.com` → `youtube.com`. */
export const displayHost = (raw: string): string => {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
};
