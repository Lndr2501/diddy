import React, { ComponentType, ReactNode, Suspense, lazy } from 'react';
import { Box, Spinner } from 'folds';

function LazySpinner() {
  return (
    <Box grow="Yes" alignItems="Center" justifyContent="Center" style={{ minHeight: 120 }}>
      <Spinner variant="Secondary" size="400" />
    </Box>
  );
}

/**
 * Splits a rarely needed screen (settings, lobby, explore, login, dialogs) out of the start bundle:
 * it is fetched and parsed the first time it is shown, not on every app start.
 *
 * `load` must import the module; `name` picks the named export. The fallback is a small spinner,
 * or nothing for renderers that show nothing until they are opened.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<P extends Record<string, any> = Record<string, never>>(
  load: () => Promise<Record<string, unknown>>,
  name: string,
  fallback: ReactNode = <LazySpinner />
): ComponentType<P> {
  // the lazy component is typed loosely; LazyLoaded keeps the real props for its callers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Lazy = lazy(async () => ({ default: (await load())[name] as ComponentType<any> }));
  function LazyLoaded(props: P) {
    return (
      <Suspense fallback={fallback}>
        {/* eslint-disable-next-line react/jsx-props-no-spreading */}
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyLoaded.displayName = `Lazy(${name})`;
  return LazyLoaded;
}
