import { useEffect, useRef } from 'react';
import { MatrixClient, SetPresence } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { DiddyStatus } from './types';
import { patchMyProfile, readProfile, useDiddyProfile } from './profiles';
import { getPrimaryOptionsRoom } from './optionsRoom';
import { presenceForStatus, resolveMyStatus, silencesAlerts } from './dnd';

const STATUS_KEY = 'diddyStatus';
const STATUSES: DiddyStatus[] = ['online', 'idle', 'dnd', 'invisible'];

export const getLocalStatus = (): DiddyStatus => {
  try {
    const value = localStorage.getItem(STATUS_KEY) as DiddyStatus | null;
    if (value && STATUSES.includes(value)) return value;
  } catch {
    // ignore
  }
  return 'online';
};

const storeLocalStatus = (status: DiddyStatus): void => {
  try {
    localStorage.setItem(STATUS_KEY, status);
  } catch {
    // ignore
  }
};

export const useMyStatus = (mx: MatrixClient): DiddyStatus =>
  resolveMyStatus(useDiddyProfile(mx, mx.getSafeUserId())?.status, getLocalStatus());

/** Your status right now, outside React: the same one the status menu shows. */
export const getMyStatus = (mx: MatrixClient): DiddyStatus =>
  resolveMyStatus(readProfile(mx, mx.getSafeUserId())?.status, getLocalStatus());

/**
 * Do not disturb: sounds, system notifications and the call ring stay silent. It reads the
 * synced profile, so DND picked in the settings or on another device counts too (#71).
 */
export const isDoNotDisturb = (mx: MatrixClient): boolean => silencesAlerts(getMyStatus(mx));

const SYNC_PRESENCE: Record<ReturnType<typeof presenceForStatus>['presence'], SetPresence> = {
  online: SetPresence.Online,
  unavailable: SetPresence.Unavailable,
  offline: SetPresence.Offline,
};

const applyPresence = async (mx: MatrixClient, status: DiddyStatus): Promise<void> => {
  const { presence, statusMsg } = presenceForStatus(status);
  // the sync loop re-announces its own presence, so it has to follow the chosen status
  try {
    await mx.setSyncPresence(SYNC_PRESENCE[presence]);
  } catch {
    // ignore, PUT /presence below may still work
  }
  await mx.setPresence(statusMsg ? { presence, status_msg: statusMsg } : { presence });
};

export const setMyStatus = async (mx: MatrixClient, status: DiddyStatus): Promise<void> => {
  storeLocalStatus(status);
  if (getPrimaryOptionsRoom(mx)) {
    try {
      await patchMyProfile(mx, { status });
    } catch {
      // ignore, the local copy is enough
    }
  }
  try {
    await applyPresence(mx, status);
  } catch {
    // presence may be disabled on the server
  }
};

/**
 * Applies your status as Matrix presence after the first sync, and again whenever the status in
 * your profile changes (picked in the profile settings, the onboarding or on another device).
 * Those paths only write the profile, so without this the presence and this device's copy kept
 * the old status and DND did nothing (#71).
 */
export const useDiddyStatusSync = (): void => {
  const mx = useMatrixClient();
  const profileStatus = useDiddyProfile(mx, mx.getSafeUserId())?.status;
  const applied = useRef<{ mx: MatrixClient; status: DiddyStatus }>();

  useEffect(() => {
    if (profileStatus) storeLocalStatus(profileStatus);
  }, [profileStatus]);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const tryApply = () => {
      if (disposed) return;
      if (!mx.isInitialSyncComplete()) {
        timer = window.setTimeout(tryApply, 2000);
        return;
      }
      const status = getMyStatus(mx);
      if (applied.current?.mx === mx && applied.current.status === status) return;
      const entry = { mx, status };
      applied.current = entry;
      applyPresence(mx, status).catch(() => {
        if (applied.current === entry) applied.current = undefined;
      });
    };
    tryApply();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [mx, profileStatus]);
};
