import { useEffect, useRef } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { APP_VERSION } from '../../appInfo';
import { useShareVersion } from '../../state/versionShare';
import { clientVersionOutdated } from './clientVersion';
import { getPrimaryOptionsRoom } from './optionsRoom';
import { patchMyProfile, readProfile, useDiddyProfile } from './profiles';

/**
 * Keeps the Diddy version in your profile up to date (#75): after an update, and when you switch
 * sharing on or off. Tries each version / choice once in a row, so a slow or failing write never
 * turns into a loop.
 */
export const useClientVersionSync = (): void => {
  const mx = useMatrixClient();
  const share = useShareVersion();
  // re-check whenever your stored profile changes (read fresh below: a timer may run late)
  const profile = useDiddyProfile(mx, mx.getSafeUserId());
  const attempted = useRef<string>();

  useEffect(() => {
    const version = share ? APP_VERSION : undefined;
    let disposed = false;
    let timer: number | undefined;
    const tryWrite = () => {
      if (disposed) return;
      // the stored profile is only known once the first sync is through
      if (!mx.isInitialSyncComplete()) {
        timer = window.setTimeout(tryWrite, 2000);
        return;
      }
      if (!getPrimaryOptionsRoom(mx)) return;
      if (!clientVersionOutdated(readProfile(mx, mx.getSafeUserId()), version)) return;
      const key = version ?? 'hidden';
      if (attempted.current === key) return;
      attempted.current = key;
      // setMyProfile stamps the version (or removes it), everything else stays as it is
      patchMyProfile(mx, {}).catch(() => undefined);
    };
    tryWrite();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [mx, share, profile]);
};
