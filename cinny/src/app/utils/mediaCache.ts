import { LruCache } from './lruCache';

/**
 * Decrypted media as object URLs, shared by every message that shows it. Without it each mount
 * of a message (room switch, scrolling back) downloaded and decrypted the file again and left the
 * old object URL behind, so memory grew for the whole session. The oldest entries are released.
 */
const MAX_ENTRIES = 150;

const cache = new LruCache<string, Promise<string>>(MAX_ENTRIES, (url) => {
  url.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
});

/** The object URL for `key` (the mxc address), loading and decrypting it once. */
export const cachedObjectUrl = (key: string, load: () => Promise<Blob>): Promise<string> => {
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = load().then((blob) => URL.createObjectURL(blob));
  cache.set(key, pending);
  // a failed download must not stay cached, so "Retry" really retries
  pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
};
