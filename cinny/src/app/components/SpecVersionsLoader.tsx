import { ReactNode, useCallback, useEffect, useState } from 'react';
import { SpecVersions, specVersions } from '../cs-api';
import { readCachedSpecVersions, writeCachedSpecVersions } from '../utils/specVersionsCache';

type SpecVersionsLoaderProps = {
  baseUrl: string;
  /**
   * Start with the answer of the last start and refresh it in the background (the client). The
   * login screen leaves it off: there the request checks that the server is reachable at all.
   */
  useCache?: boolean;
  fallback?: (retry: () => void) => ReactNode;
  error?: (err: unknown, retry: () => void, ignore: () => void) => ReactNode;
  children: (versions: SpecVersions) => ReactNode;
};
type LoadState = {
  key: string;
  status: 'loading' | 'success' | 'error';
  versions?: SpecVersions;
  error?: unknown;
};

const storage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export function SpecVersionsLoader({
  baseUrl,
  useCache,
  fallback,
  error,
  children,
}: SpecVersionsLoaderProps) {
  const [attempt, setAttempt] = useState(0);
  const key = `${baseUrl}\n${attempt}`;
  const [state, setState] = useState<LoadState>(() => {
    const cached = useCache ? readCachedSpecVersions(storage(), baseUrl) : undefined;
    return cached ? { key, status: 'success', versions: cached } : { key, status: 'loading' };
  });
  const [ignoredKey, setIgnoredKey] = useState<string>();
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const ignore = useCallback(() => setIgnoredKey(key), [key]);

  useEffect(() => {
    const controller = new AbortController();
    const cached = useCache ? readCachedSpecVersions(storage(), baseUrl) : undefined;
    // keep the state object when it already shows this answer: a new one re-renders the whole app
    setState((prev) => {
      if (cached) return prev.key === key && prev.status === 'success' ? prev : { key, status: 'success', versions: cached };
      return { key, status: 'loading' };
    });
    specVersions(fetch, baseUrl, controller.signal).then(
      (versions) => {
        if (controller.signal.aborted) return;
        if (useCache) writeCachedSpecVersions(storage(), baseUrl, versions);
        setState((prev) =>
          prev.key === key &&
          prev.status === 'success' &&
          JSON.stringify(prev.versions) === JSON.stringify(versions)
            ? prev
            : { key, status: 'success', versions }
        );
      },
      (err: unknown) => {
        // with a cached answer the app keeps running; the sync shows its own offline state
        if (!controller.signal.aborted && !cached) setState({ key, status: 'error', error: err });
      }
    );
    return () => controller.abort();
  }, [baseUrl, key, useCache]);

  // Never briefly expose the previous server's result while a new effect is starting.
  if (state.key !== key || state.status === 'loading') return fallback?.(retry);
  if (state.status === 'error' && ignoredKey !== key) return error?.(state.error, retry, ignore);
  return children(state.versions ?? { versions: [] });
}
