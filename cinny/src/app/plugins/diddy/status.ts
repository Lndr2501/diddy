import { useEffect } from 'react';
import { MatrixClient } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { DiddyStatus } from './types';
import { patchMyProfile, useDiddyProfile } from './profiles';
import { getPrimaryOptionsRoom } from './optionsRoom';

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

export const useMyStatus = (mx: MatrixClient): DiddyStatus =>
  useDiddyProfile(mx, mx.getSafeUserId())?.status ?? getLocalStatus();

const applyPresence = async (mx: MatrixClient, status: DiddyStatus): Promise<void> => {
  let presence: 'online' | 'offline' | 'unavailable' = 'online';
  let statusMsg: string | undefined;
  if (status === 'dnd') {
    statusMsg = 'Do not disturb';
  } else if (status === 'idle') {
    presence = 'unavailable';
  } else if (status === 'invisible') {
    presence = 'offline';
  }
  await mx.setPresence({ presence, status_msg: statusMsg });
};

export const setMyStatus = async (mx: MatrixClient, status: DiddyStatus): Promise<void> => {
  try {
    localStorage.setItem(STATUS_KEY, status);
  } catch {
    // ignore
  }
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

/** Applies the stored status as Matrix presence once after the first sync. */
export const useDiddyStatusSync = (): void => {
  const mx = useMatrixClient();
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const tryApply = () => {
      if (disposed) return;
      if (mx.isInitialSyncComplete()) {
        applyPresence(mx, getLocalStatus()).catch(() => {});
        return;
      }
      timer = window.setTimeout(tryApply, 2000);
    };
    tryApply();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [mx]);
};
