/**
 * Local plugins (#98): plugins without hosting. The HTML of such a plugin is kept on this device
 * and shown with `srcdoc` in exactly the same sandbox as every other plugin (see userPlugins.ts).
 * It can come from a file, from pasted code or from a one-time import of a public GitHub file or
 * Gist. This module is the pure, testable part: content checks, the GitHub/Gist address rules,
 * hashing and the size-capped fetch. It has no imports; the only globals it uses are `URL`,
 * `TextEncoder`/`TextDecoder`, `AbortController`, `crypto.subtle` and `setTimeout`, and `fetch`
 * is passed in, so all of it runs in plain Node tests.
 */

/** Largest HTML a local plugin may have (bytes, UTF-8). */
export const MAX_LOCAL_PLUGIN_BYTES = 512 * 1024;
/** How long an import from GitHub may take. */
export const SOURCE_FETCH_TIMEOUT = 15000;
export const MAX_SOURCE_URL_LENGTH = 2048;
/** Hosts a plugin may be imported from. Exact names only, no subdomains. */
export const SOURCE_HOSTS = [
  'github.com',
  'raw.githubusercontent.com',
  'gist.github.com',
  'gist.githubusercontent.com',
];

export type LocalOrigin = 'file' | 'paste' | 'github' | 'gist';

/** What is stored for a local plugin (IndexedDB, keyed by plugin id). */
export type LocalPluginRecord = {
  html: string;
  /** hex SHA-256 of the UTF-8 bytes of `html` */
  sha256: string;
  size: number;
  origin: LocalOrigin;
  updatedAt: number;
  fileName?: string;
  /** github/gist: the address the user entered and the raw address that was fetched */
  sourceUrl?: string;
  rawUrl?: string;
  fetchedAt?: number;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const TOO_LARGE = `The plugin is too large (at most ${formatSize(MAX_LOCAL_PLUGIN_BYTES)}).`;

/** Tags a plugin page normally starts with or contains. */
const HTML_TAG =
  /<(!doctype\s+html|html|head|body|meta|title|script|style|link|main|div|section|article|template|canvas|svg|button|span|p|h[1-6]|ul|table)[\s>/]/i;

/**
 * Checks pasted, loaded or fetched content: not empty, within the size cap, no binary data,
 * and it looks like an HTML page. Returns the content without a leading byte order mark.
 */
export const validateLocalHtml = (input: string): Result<string> => {
  if (typeof input !== 'string') return fail('This is not an HTML page.');
  const html = input.replace(/^\uFEFF/, '');
  if (!html.trim()) return fail('The plugin is empty.');
  if (html.length > MAX_LOCAL_PLUGIN_BYTES || byteLength(html) > MAX_LOCAL_PLUGIN_BYTES) {
    return fail(TOO_LARGE);
  }
  if (html.includes('\u0000')) return fail('This looks like a binary file, not an HTML page.');
  if (!html.trimStart().startsWith('<') || !HTML_TAG.test(html)) {
    return fail('This does not look like an HTML page.');
  }
  return ok(html);
};

/** Whether a picked or dropped file may be a plugin page (by name or type), before reading it. */
export const checkPluginFile = (file: {
  name: string;
  type: string;
  size: number;
}): Result<true> => {
  const byName = /\.html?$/i.test(file.name);
  const byType = file.type === 'text/html';
  if (!byName && !byType) return fail('Choose an .html or .htm file.');
  if (file.size > MAX_LOCAL_PLUGIN_BYTES) return fail(TOO_LARGE);
  return ok(true);
};

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const cleanName = (value: string, max: number): string =>
  value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max).trim();

/** The text of the page's `<title>`, cleaned and cut to `max` characters ('' if none). */
export const extractHtmlTitle = (html: string, max = 40): string => {
  const match = /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(html.slice(0, 20000));
  if (!match) return '';
  const text = match[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]);
  return cleanName(text, max);
};

/** `my-weather.html` -> `my-weather`. */
export const nameFromFileName = (fileName: string, max = 40): string =>
  cleanName(fileName.replace(/^.*[\\/]/, '').replace(/\.html?$/i, ''), max);

/** Name for a new local plugin: what the user typed, else the page title, else the fallback. */
export const defaultPluginName = (typed: string, html: string, fallback: string): string =>
  cleanName(typed, 80) || extractHtmlTitle(html) || cleanName(fallback, 40);

/* ---------- GitHub / Gist sources ---------- */

export type SourceKind = 'github' | 'gist';
export type PluginSource = {
  kind: SourceKind;
  /** the raw address that is fetched */
  rawUrl: string;
  /** short label for the card, e.g. `user/repo/main/plugin.html` */
  label: string;
};

const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GIST_ID = /^[A-Fa-f0-9]{1,64}$/;

const segmentsOk = (segments: string[]): boolean =>
  segments.length > 0 && segments.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..');

/**
 * Turns a GitHub file or Gist link into the raw address to fetch. Accepted:
 *   https://github.com/<user>/<repo>/blob/<branch>/<path>.html   (also /raw/)
 *   https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.html
 *   https://gist.github.com/<user>/<id>
 *   https://gist.githubusercontent.com/<user>/<id>/raw[/<revision>][/<file>]
 * Only https, only these exact hosts, no user/password, no port, no `..`, no encoded slashes or
 * dots; query and fragment are dropped. Without a scheme https:// is assumed.
 */
export const toRawSourceUrl = (input: string): Result<PluginSource> => {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return fail('Enter the address of a GitHub file or Gist.');
  if (raw.length > MAX_SOURCE_URL_LENGTH) return fail('This address is too long.');
  if (/\s/.test(raw)) return fail('The address must not contain spaces.');
  if (raw.includes('\\')) return fail('This is not a valid address.');

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return fail('This is not a valid address.');
  }
  if (url.protocol !== 'https:') return fail('Only https:// addresses can be imported.');
  if (url.username || url.password) return fail('The address must not contain a user or password.');
  if (url.port) return fail('The address must not contain a port.');
  const host = url.hostname.toLowerCase();
  if (!SOURCE_HOSTS.includes(host)) {
    return fail('Only github.com, raw.githubusercontent.com and Gist links can be imported.');
  }
  // `..`, `.` and encoded separators are refused outright, before and after URL normalization
  const path = url.pathname;
  if (/%2e|%2f|%5c|%00/i.test(path) || /(^|\/)\.\.?(\/|$)/.test(raw.split(/[?#]/)[0])) {
    return fail('This path is not allowed.');
  }
  const parts = path.split('/').slice(1);
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  if (!segmentsOk(parts)) return fail('This path is not allowed.');

  const isHtml = (file: string) => /\.html?$/i.test(file);

  if (host === 'github.com' || host === 'raw.githubusercontent.com') {
    let owner: string;
    let repo: string;
    let rest: string[];
    if (host === 'github.com') {
      // <user>/<repo>/blob|raw/<branch>/<path...>
      if (parts.length < 5 || (parts[2] !== 'blob' && parts[2] !== 'raw')) {
        return fail(
          'Use the link of a single file, e.g. github.com/user/repo/blob/main/plugin.html.'
        );
      }
      [owner, repo] = parts;
      rest = parts.slice(3);
    } else {
      if (parts.length < 4) return fail('Use the link of a single file.');
      [owner, repo] = parts;
      rest = parts.slice(2);
    }
    if (!OWNER.test(owner)) return fail('This is not a valid GitHub user.');
    if (!isHtml(rest[rest.length - 1])) return fail('Only .html or .htm files can be imported.');
    const tail = [owner, repo, ...rest].join('/');
    return ok({ kind: 'github', rawUrl: `https://raw.githubusercontent.com/${tail}`, label: tail });
  }

  // Gist
  if (host === 'gist.github.com') {
    // <user>/<id>, optionally /raw[/<revision>][/<file>] which is the same file on the raw host
    if (parts.length < 2) return fail('Use the link of a Gist, e.g. gist.github.com/user/<id>.');
    const [owner, id, ...rest] = parts;
    if (!OWNER.test(owner) || !GIST_ID.test(id)) return fail('This is not a valid Gist link.');
    if (rest.length > 0 && (rest[0] !== 'raw' || rest.length > 3)) {
      return fail('This is not a valid Gist link.');
    }
    const tail = [owner, id, 'raw', ...rest.slice(1)].join('/');
    return ok({
      kind: 'gist',
      rawUrl: `https://gist.githubusercontent.com/${tail}`,
      label: `${owner}/${id}`,
    });
  }

  // gist.githubusercontent.com/<user>/<id>/raw[/<revision>][/<file>]
  const [owner, id, rawPart, ...rest] = parts;
  if (!owner || !OWNER.test(owner) || !id || !GIST_ID.test(id) || rawPart !== 'raw') {
    return fail('This is not a valid Gist link.');
  }
  if (rest.length > 2) return fail('This is not a valid Gist link.');
  const tail = [owner, id, 'raw', ...rest].join('/');
  return ok({
    kind: 'gist',
    rawUrl: `https://gist.githubusercontent.com/${tail}`,
    label: `${owner}/${id}`,
  });
};

/* ---------- hash ---------- */

/** Hex SHA-256 of the UTF-8 bytes of `text`. */
export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** First 12 hex characters, enough to tell versions apart at a glance. */
export const shortHash = (hex: string): string => (hex || '').slice(0, 12);

/* ---------- fetch ---------- */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type FetchSourceOptions = { timeoutMs?: number; maxBytes?: number };

/**
 * Fetches a GitHub/Gist raw address once: the address is checked again, redirects are refused,
 * no cookies or referrer are sent, the body is read with a byte cap and the whole request is cut
 * off after a timeout. Returns the validated HTML.
 */
export const fetchSourceHtml = async (
  rawUrl: string,
  fetchFn: FetchLike,
  { timeoutMs = SOURCE_FETCH_TIMEOUT, maxBytes = MAX_LOCAL_PLUGIN_BYTES }: FetchSourceOptions = {}
): Promise<Result<string>> => {
  const checked = toRawSourceUrl(rawUrl);
  if (!checked.ok) return checked;
  if (checked.value.rawUrl !== rawUrl) return fail('This address cannot be fetched.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(rawUrl, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return fail(
        response.status === 404
          ? 'The file was not found (is the repository public?).'
          : `GitHub answered with an error (${response.status}).`
      );
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) return fail(TOO_LARGE);

    const bytes: Uint8Array[] = [];
    let total = 0;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          controller.abort();
          return fail(TOO_LARGE);
        }
        bytes.push(value);
      }
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.length > maxBytes) return fail(TOO_LARGE);
      bytes.push(buffer);
      total = buffer.length;
    }
    const all = new Uint8Array(total);
    let offset = 0;
    bytes.forEach((chunk) => {
      all.set(chunk, offset);
      offset += chunk.length;
    });
    return validateLocalHtml(new TextDecoder('utf-8').decode(all));
  } catch {
    if (controller.signal.aborted) return fail('Loading took too long. Try again.');
    return fail('Could not load the file. Check the address and your connection.');
  } finally {
    clearTimeout(timer);
  }
};
