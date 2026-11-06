import { ReactNode, useCallback, useEffect, useState } from 'react';
import { SpecVersions, specVersions } from '../cs-api';

type SpecVersionsLoaderProps = {
  baseUrl: string;
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

export function SpecVersionsLoader({
  baseUrl,
  fallback,
  error,
  children,
}: SpecVersionsLoaderProps) {
  const [attempt, setAttempt] = useState(0);
  const key = `${baseUrl}\n${attempt}`;
  const [state, setState] = useState<LoadState>({ key, status: 'loading' });
  const [ignoredKey, setIgnoredKey] = useState<string>();
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const ignore = useCallback(() => setIgnoredKey(key), [key]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    specVersions(fetch, baseUrl, controller.signal).then(
      (versions) => {
        if (!controller.signal.aborted) setState({ key, status: 'success', versions });
      },
      (err: unknown) => {
        if (!controller.signal.aborted) setState({ key, status: 'error', error: err });
      }
    );
    return () => controller.abort();
  }, [baseUrl, key]);

  // Never briefly expose the previous server's result while a new effect is starting.
  if (state.key !== key || state.status === 'loading') return fallback?.(retry);
  if (state.status === 'error' && ignoredKey !== key) return error?.(state.error, retry, ignore);
  return children(state.versions ?? { versions: [] });
}
