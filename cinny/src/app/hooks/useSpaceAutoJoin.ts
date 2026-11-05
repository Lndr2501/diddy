import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { EventType } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useStateEventCallback } from './useStateEventCallback';
import {
  AUTO_JOIN_CHANGE_EVENT,
  readAutoJoinStore,
  runSpaceAutoJoin,
  setSpaceAutoJoin,
} from '../utils/spaceJoin';

const subscribe = (onChange: () => void) => {
  window.addEventListener(AUTO_JOIN_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(AUTO_JOIN_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** Space IDs that have auto-join turned on, as a stable, sorted, comma-joined string. */
const useAutoJoinSpaceKey = (): string => {
  const mx = useMatrixClient();
  return useSyncExternalStore(
    subscribe,
    useCallback(() => Object.keys(readAutoJoinStore(mx)).sort().join(','), [mx])
  );
};

export const useSpaceAutoJoin = (spaceId: string): [boolean, (enabled: boolean) => void] => {
  const mx = useMatrixClient();
  const key = useAutoJoinSpaceKey();
  const enabled = useMemo(() => key.split(',').includes(spaceId), [key, spaceId]);
  const setEnabled = useCallback(
    (value: boolean) => setSpaceAutoJoin(mx, spaceId, value),
    [mx, spaceId]
  );
  return [enabled, setEnabled];
};

const RECHECK_INTERVAL_MS = 10 * 60 * 1000;
const STATE_EVENT_DEBOUNCE_MS = 2000;

/**
 * Background worker: keeps spaces with auto-join on in sync. Runs after the first sync, when
 * auto-join is switched on, when a space gets a new child, and every few minutes as a safety net.
 */
export const useSpaceAutoJoinWorker = () => {
  const mx = useMatrixClient();
  const key = useAutoJoinSpaceKey();
  const spaceIds = useMemo(() => (key ? key.split(',') : []), [key]);
  const timers = useRef(new Map<string, number>());

  const runAll = useCallback(() => {
    if (!mx.isInitialSyncComplete()) return;
    spaceIds.forEach((id) => {
      runSpaceAutoJoin(mx, id);
    });
  }, [mx, spaceIds]);

  useEffect(() => {
    if (spaceIds.length === 0) return undefined;
    const first = window.setTimeout(runAll, 3000);
    const retryUntilSynced = window.setInterval(() => {
      if (mx.isInitialSyncComplete()) {
        window.clearInterval(retryUntilSynced);
        runAll();
      }
    }, 2000);
    const interval = window.setInterval(runAll, RECHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(retryUntilSynced);
      window.clearInterval(interval);
    };
  }, [mx, spaceIds, runAll]);

  useStateEventCallback(
    mx,
    useCallback(
      (event) => {
        if (event.getType() !== EventType.SpaceChild) return;
        const spaceId = event.getRoomId();
        if (!spaceId || !spaceIds.includes(spaceId)) return;
        window.clearTimeout(timers.current.get(spaceId));
        timers.current.set(
          spaceId,
          window.setTimeout(() => {
            runSpaceAutoJoin(mx, spaceId);
          }, STATE_EVENT_DEBOUNCE_MS)
        );
      },
      [mx, spaceIds]
    )
  );
};
