/**
 * Reads link cards through the desktop shell (`link_preview_fetch`, Tauri on macOS and Electron on
 * Linux), see linkEmbeds.ts. Answers are kept for the session so scrolling does not fetch again;
 * a failed fetch is forgotten, so the next time the message shows it is tried again.
 */
import { canInvoke, invoke } from './tauri';
import { LinkMeta, isFetchableLink, parseLinkMeta } from './linkEmbeds';

const MAX_KEPT = 300;
const kept = new Map<string, Promise<LinkMeta | undefined>>();

/** Whether this app can read pages itself (not in a plain browser). */
export const canFetchLinks = (): boolean => canInvoke();

export const fetchLinkMeta = (url: string): Promise<LinkMeta | undefined> => {
  if (!canInvoke() || !isFetchableLink(url)) return Promise.resolve(undefined);
  const known = kept.get(url);
  if (known) return known;
  if (kept.size >= MAX_KEPT) kept.clear();
  const running = invoke<string>('link_preview_fetch', { url })
    .then((html) => parseLinkMeta(html, url))
    .catch(() => {
      kept.delete(url);
      return undefined;
    });
  kept.set(url, running);
  return running;
};
