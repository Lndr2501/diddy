/**
 * The server's `/versions` answer from the last start. The client waited for this request before
 * showing anything (offline up to the request timeout, then a "continue" button); with the last
 * answer the app opens at once and the request runs in the background.
 */
export type CachedSpecVersions = {
  versions: string[];
  unstable_features?: Record<string, boolean>;
};

const PREFIX = 'diddy-spec-versions:';

const valid = (value: unknown): value is CachedSpecVersions =>
  !!value &&
  typeof value === 'object' &&
  Array.isArray((value as CachedSpecVersions).versions) &&
  (value as CachedSpecVersions).versions.every((v) => typeof v === 'string');

export const readCachedSpecVersions = (
  storage: Pick<Storage, 'getItem'> | undefined,
  baseUrl: string
): CachedSpecVersions | undefined => {
  try {
    const raw = storage?.getItem(PREFIX + baseUrl);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

export const writeCachedSpecVersions = (
  storage: Pick<Storage, 'setItem'> | undefined,
  baseUrl: string,
  versions: CachedSpecVersions
): void => {
  if (!valid(versions)) return;
  try {
    storage?.setItem(
      PREFIX + baseUrl,
      JSON.stringify({ versions: versions.versions, unstable_features: versions.unstable_features })
    );
  } catch {
    // storage full or unavailable: the next start just waits for the request again
  }
};
