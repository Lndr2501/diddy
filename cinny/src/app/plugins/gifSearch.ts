/**
 * GIF search (#82): pluggable providers (GIPHY, KLIPY) behind one small interface.
 *
 * Everything here is pure (no DOM, no React) so it can be unit tested: building request URLs,
 * turning provider responses into a normalised result list, and only letting through media URLs
 * that are https and on the provider's own CDN. API keys are the user's own (entered in
 * Settings > General > GIFs and kept on this device); they are never logged. KLIPY puts the key
 * in the URL path, so request URLs must never end up in logs or error messages.
 */

export type GifProviderId = 'giphy' | 'klipy';
export type GifRating = 'g' | 'pg' | 'pg-13' | 'r';

export const GIF_RATINGS: GifRating[] = ['g', 'pg', 'pg-13', 'r'];
export const GIF_PROVIDER_IDS: GifProviderId[] = ['giphy', 'klipy'];

/** One GIF, the same shape for every provider. */
export type GifResult = {
  id: string;
  title: string;
  /** small animated rendition for the picker grid */
  previewUrl: string;
  /** still frame of the preview, used when motion should be reduced */
  stillUrl?: string;
  previewWidth: number;
  previewHeight: number;
  /** rendition that is downloaded and uploaded to the homeserver when the GIF is sent */
  sendUrl: string;
  w: number;
  h: number;
  mimetype: string;
  size?: number;
};

export type GifPage = {
  results: GifResult[];
  /** cursor for the next page (offset for GIPHY, page number for KLIPY), undefined at the end */
  next?: number;
};

export type GifQuery = {
  apiKey: string;
  rating: GifRating;
  /** search term; empty or missing means trending */
  query?: string;
  cursor?: number;
  limit?: number;
  /** anonymous, stable per-device id (KLIPY asks for one per user) */
  customerId?: string;
};

export type GifProvider = {
  id: GifProviderId;
  name: string;
  /** attribution the provider asks for, shown wherever its results are shown */
  attribution: string;
  searchPlaceholder: string;
  /** where users get their own API key */
  keyUrl: string;
  buildUrl: (q: GifQuery) => string;
  parse: (json: unknown, q: GifQuery) => GifPage;
};

export const DEFAULT_GIF_LIMIT = 24;
/** renditions above this size are skipped in favour of a smaller one when there is a choice */
export const MAX_SEND_BYTES = 4 * 1024 * 1024;
/** hard limit for a download, whatever the API claims */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const MAX_QUERY_LENGTH = 50;
// GIPHY rejects offsets above 4999
const GIPHY_MAX_OFFSET = 4999;

const GIPHY_MEDIA_HOST = /^(media\d?|i)\.giphy\.com$/;
// https://docs.klipy.com/network-requirements
const KLIPY_MEDIA_HOSTS = new Set(['static.klipy.com', 'static1.klipy.com', 'static2.klipy.com']);

export const isAllowedMediaHost = (provider: GifProviderId, host: string): boolean =>
  provider === 'giphy' ? GIPHY_MEDIA_HOST.test(host) : KLIPY_MEDIA_HOSTS.has(host);

/** The URL if it is plain https on the provider's media CDN, otherwise undefined. */
export const safeMediaUrl = (provider: GifProviderId, raw: unknown): string | undefined => {
  if (typeof raw !== 'string' || raw.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
  if (!isAllowedMediaHost(provider, url.hostname.toLowerCase())) return undefined;
  return url.href;
};

/** API keys are short tokens; anything else (spaces, slashes, ...) is a paste mistake. */
export const isPlausibleApiKey = (key: string): boolean => /^[A-Za-z0-9_-]{8,128}$/.test(key);

export const normaliseQuery = (query: string | undefined): string =>
  (query ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);

const toInt = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const cleanTitle = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : '';

const clampLimit = (limit: number | undefined) =>
  Math.min(50, Math.max(1, Math.round(limit ?? DEFAULT_GIF_LIMIT)));

type Rendition = { url: string; width: number; height: number; size?: number };

const rendition = (
  provider: GifProviderId,
  value: unknown,
  urlKey = 'url'
): Rendition | undefined => {
  const r = asRecord(value);
  if (!r) return undefined;
  const url = safeMediaUrl(provider, r[urlKey]);
  const width = toInt(r.width);
  const height = toInt(r.height);
  if (!url || !width || !height) return undefined;
  return { url, width, height, size: toInt(r.size) };
};

/** First rendition that is small enough; the smallest one if none is. */
const pickSendRendition = (candidates: (Rendition | undefined)[]): Rendition | undefined => {
  const usable = candidates.filter((c): c is Rendition => !!c);
  return (
    usable.find((c) => c.size === undefined || c.size <= MAX_SEND_BYTES) ??
    [...usable].sort((a, b) => (a.size ?? 0) - (b.size ?? 0))[0]
  );
};

const mimetypeOf = (url: string): string => {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  return 'image/gif';
};

// --- GIPHY -----------------------------------------------------------------------------------

const parseGiphyItem = (value: unknown): GifResult | undefined => {
  const item = asRecord(value);
  if (!item || (item.type !== undefined && item.type !== 'gif')) return undefined;
  const id = typeof item.id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(item.id) ? item.id : '';
  const images = asRecord(item.images);
  if (!id || !images) return undefined;

  const preview =
    rendition('giphy', images.fixed_height_small) ?? rendition('giphy', images.fixed_height);
  const still =
    rendition('giphy', images.fixed_height_small_still) ??
    rendition('giphy', images.fixed_height_still);
  const send = pickSendRendition([
    rendition('giphy', images.downsized),
    rendition('giphy', images.fixed_height),
    rendition('giphy', images.original),
  ]);
  if (!preview || !send) return undefined;

  return {
    id,
    title: cleanTitle(item.title),
    previewUrl: preview.url,
    stillUrl: still?.url,
    previewWidth: preview.width,
    previewHeight: preview.height,
    sendUrl: send.url,
    w: send.width,
    h: send.height,
    mimetype: mimetypeOf(send.url),
    size: send.size,
  };
};

export const giphyProvider: GifProvider = {
  id: 'giphy',
  name: 'GIPHY',
  attribution: 'Powered by GIPHY',
  searchPlaceholder: 'Search GIPHY',
  keyUrl: 'https://developers.giphy.com/dashboard/',
  buildUrl: (q) => {
    const query = normaliseQuery(q.query);
    const params = new URLSearchParams({
      api_key: q.apiKey,
      limit: String(clampLimit(q.limit)),
      offset: String(Math.min(GIPHY_MAX_OFFSET, Math.max(0, Math.round(q.cursor ?? 0)))),
      rating: q.rating,
    });
    if (query) params.set('q', query);
    return `https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}?${params}`;
  },
  parse: (json) => {
    const body = asRecord(json);
    const data = Array.isArray(body?.data) ? body?.data : [];
    const results = (data as unknown[]).map(parseGiphyItem).filter((r): r is GifResult => !!r);
    const pagination = asRecord(body?.pagination);
    const offset = toInt(pagination?.offset) ?? 0;
    const count = toInt(pagination?.count) ?? 0;
    const total = toInt(pagination?.total_count);
    const nextOffset = offset + count;
    const more =
      count > 0 && nextOffset <= GIPHY_MAX_OFFSET && (total === undefined || nextOffset < total);
    return { results, next: more ? nextOffset : undefined };
  },
};

// --- KLIPY -----------------------------------------------------------------------------------

/** GIPHY-style rating to KLIPY's content_filter (off, low, medium, high). */
export const klipyContentFilter = (rating: GifRating): string =>
  ({ g: 'high', pg: 'medium', 'pg-13': 'low', r: 'off' }[rating] ?? 'high');

const parseKlipyItem = (value: unknown): GifResult | undefined => {
  const item = asRecord(value);
  // ads (type "ad") and anything else that is not a GIF is left out
  if (!item || item.type !== 'gif') return undefined;
  const rawId = typeof item.id === 'number' ? String(item.id) : item.id;
  const id = typeof rawId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(rawId) ? rawId : '';
  const file = asRecord(item.file);
  if (!id || !file) return undefined;
  const size = (name: string) => asRecord(file[name]);

  const preview =
    rendition('klipy', size('sm')?.webp) ??
    rendition('klipy', size('sm')?.gif) ??
    rendition('klipy', size('xs')?.gif);
  const still = rendition('klipy', size('sm')?.jpg);
  const send = pickSendRendition([
    rendition('klipy', size('md')?.gif),
    rendition('klipy', size('sm')?.gif),
    rendition('klipy', size('hd')?.gif),
  ]);
  if (!preview || !send) return undefined;

  return {
    id,
    title: cleanTitle(item.title),
    previewUrl: preview.url,
    stillUrl: still?.url,
    previewWidth: preview.width,
    previewHeight: preview.height,
    sendUrl: send.url,
    w: send.width,
    h: send.height,
    mimetype: mimetypeOf(send.url),
    size: send.size,
  };
};

export const klipyProvider: GifProvider = {
  id: 'klipy',
  name: 'KLIPY',
  attribution: 'Powered by KLIPY',
  // KLIPY requires this exact placeholder (docs.klipy.com/attribution)
  searchPlaceholder: 'Search KLIPY',
  keyUrl: 'https://partner.klipy.com/',
  buildUrl: (q) => {
    const query = normaliseQuery(q.query);
    const params = new URLSearchParams({
      page: String(Math.max(1, Math.round(q.cursor ?? 1))),
      per_page: String(clampLimit(q.limit)),
      content_filter: klipyContentFilter(q.rating),
      format_filter: 'gif,webp,jpg',
    });
    if (query) params.set('q', query);
    if (q.customerId) params.set('customer_id', q.customerId);
    return `https://api.klipy.com/api/v1/${encodeURIComponent(q.apiKey)}/gifs/${
      query ? 'search' : 'trending'
    }?${params}`;
  },
  parse: (json) => {
    const body = asRecord(json);
    const page = asRecord(body?.data);
    const data = Array.isArray(page?.data) ? page?.data : [];
    const results = (data as unknown[]).map(parseKlipyItem).filter((r): r is GifResult => !!r);
    const current = toInt(page?.current_page) ?? 1;
    return { results, next: page?.has_next === true ? current + 1 : undefined };
  },
};

export const GIF_PROVIDERS: Record<GifProviderId, GifProvider> = {
  giphy: giphyProvider,
  klipy: klipyProvider,
};

export const getGifProvider = (id: GifProviderId): GifProvider =>
  GIF_PROVIDERS[id] ?? giphyProvider;

// --- requests --------------------------------------------------------------------------------

export class GifSearchError extends Error {
  constructor(message: string, readonly keyRejected = false) {
    super(message);
    this.name = 'GifSearchError';
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Loads one page of results. Errors carry a short message without the request URL (which
 * contains the API key).
 */
export const fetchGifPage = async (
  provider: GifProvider,
  q: GifQuery,
  fetchImpl: FetchLike,
  signal?: AbortSignal
): Promise<GifPage> => {
  if (!isPlausibleApiKey(q.apiKey)) {
    throw new GifSearchError(`The ${provider.name} API key looks incomplete.`, true);
  }
  let response: Response;
  try {
    response = await fetchImpl(provider.buildUrl(q), {
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new GifSearchError(`${provider.name} could not be reached.`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }
  const keyRejected =
    response.status === 401 ||
    response.status === 403 ||
    (provider.id === 'klipy' && response.status === 404 && asRecord(json)?.result === false);
  if (keyRejected) {
    throw new GifSearchError(`${provider.name} did not accept the API key.`, true);
  }
  if (response.status === 429) {
    throw new GifSearchError(`Too many requests to ${provider.name}, try again in a minute.`);
  }
  if (!response.ok || json === undefined) {
    throw new GifSearchError(`${provider.name} answered with an error (${response.status}).`);
  }
  return provider.parse(json, q);
};

/** File name for the uploaded GIF, derived from its title. */
export const gifFileName = (result: Pick<GifResult, 'title' | 'mimetype'>): string => {
  const base =
    result.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'gif';
  const ext = { 'image/webp': 'webp', 'image/png': 'png' }[result.mimetype] ?? 'gif';
  return `${base}.${ext}`;
};

/** Accepts a downloaded GIF only if it is an image of a sensible size. */
export const checkDownloadedGif = (
  type: string,
  size: number
): { ok: true } | { ok: false; reason: string } => {
  if (!/^image\/(gif|webp|png)$/.test(type)) return { ok: false, reason: 'not an image' };
  if (size <= 0) return { ok: false, reason: 'empty file' };
  if (size > MAX_DOWNLOAD_BYTES) return { ok: false, reason: 'file too large' };
  return { ok: true };
};
