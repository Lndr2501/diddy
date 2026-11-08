import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const getList = (): MediaQueryList | undefined =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : undefined;

const subscribe = (listener: () => void) => {
  const list = getList();
  list?.addEventListener('change', listener);
  return () => list?.removeEventListener('change', listener);
};

const getSnapshot = (): boolean => getList()?.matches ?? false;

/** True while the system asks for reduced motion; follows changes live. */
export const usePrefersReducedMotion = (): boolean => useSyncExternalStore(subscribe, getSnapshot);
