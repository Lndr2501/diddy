/**
 * MyInstants import for the soundboard. Pages and sound files are fetched by the Tauri shell
 * (the site has no CORS headers, so the page cannot do it itself); everything here only parses.
 */
import { canInvoke, invoke } from './tauri';

const ORIGIN = 'https://www.myinstants.com';
const HOSTS = ['www.myinstants.com', 'myinstants.com'];
const SOUND_PATH = /^\/media\/sounds\/[^?#]+$/;

export const canImportFromMyInstants = (): boolean => canInvoke();

export type MyInstant = {
  /** Path of the sound file, e.g. /media/sounds/xyz.mp3 */
  path: string;
  name: string;
};

export type SearchPage = {
  items: MyInstant[];
  hasNext: boolean;
};

export type Target =
  | { kind: 'search'; name: string; page: number }
  | { kind: 'instant'; url: string };

/** Accepts a search term, a MyInstants search link or the link of a single sound. */
export const parseInput = (input: string): Target | undefined => {
  const text = input.trim();
  if (!text) return undefined;

  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return undefined;
    }
    if (!HOSTS.includes(url.hostname)) return undefined;
    if (/\/search\/?$/.test(url.pathname)) {
      const name = url.searchParams.get('name')?.trim();
      if (!name) return undefined;
      return { kind: 'search', name, page: Math.max(1, Number(url.searchParams.get('page')) || 1) };
    }
    if (/\/instant\//.test(url.pathname)) {
      return { kind: 'instant', url: `${ORIGIN}${url.pathname}` };
    }
    return undefined;
  }

  return { kind: 'search', name: text, page: 1 };
};

const searchUrl = (name: string, page: number) =>
  `${ORIGIN}/en/search/?name=${encodeURIComponent(name)}&page=${page}`;

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim();

/** A normal results page has at least this many sounds (36 today); a shorter one is the last. */
export const FULL_PAGE = 20;

/**
 * Whether another results page may follow. myinstants.com loads further pages by infinite
 * scroll and no longer has a `rel="next"` link, so a full page counts as "there is more".
 * The link is still honoured in case it comes back.
 */
export const hasNextPage = (html: string, itemCount: number): boolean =>
  /rel=["']?next\b/i.test(html) || itemCount >= FULL_PAGE;

/** The site answers 404 for a page past the last one. */
export const isMissingPage = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error);
  return /answered 404\b/.test(text);
};

const parseSearch = (html: string): SearchPage => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items: MyInstant[] = [];

  doc.querySelectorAll('.instant').forEach((el) => {
    const onclick = el.querySelector('button.small-button')?.getAttribute('onclick') ?? '';
    const path = /play\('([^']+)'/.exec(onclick)?.[1];
    const name = cleanName(el.querySelector('a.instant-link')?.textContent ?? '');
    if (path && name && SOUND_PATH.test(path) && !path.includes('..')) {
      items.push({ path, name });
    }
  });

  return { items, hasNext: hasNextPage(html, items.length) };
};

export const searchMyInstants = async (name: string, page: number): Promise<SearchPage> => {
  let html: string;
  try {
    html = await invoke<string>('myinstants_fetch_text', { url: searchUrl(name, page) });
  } catch (e) {
    // When the previous page was exactly full, the next one does not exist.
    if (page > 1 && isMissingPage(e)) return { items: [], hasNext: false };
    throw e;
  }
  return parseSearch(html);
};

/** Resolves the link of a single sound page. */
export const fetchInstantPage = async (url: string): Promise<MyInstant | undefined> => {
  const html = await invoke<string>('myinstants_fetch_text', { url });
  const path = /play\('(\/media\/sounds\/[^']+)'/.exec(html)?.[1];
  if (!path || path.includes('..')) return undefined;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const name =
    cleanName(doc.querySelector('h1')?.textContent ?? '') ||
    decodeURIComponent(url.split('/').filter(Boolean).pop() ?? 'sound');
  return { path, name };
};

export const downloadMyInstant = (item: MyInstant): Promise<ArrayBuffer> =>
  invoke<ArrayBuffer>('myinstants_fetch_audio', { url: `${ORIGIN}${item.path}` });
