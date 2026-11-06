import { useEffect } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinOptionsRoomOfSpace } from './optionsRoom';

const RECHECK_INTERVAL_MS = 10 * 60 * 1000;
const SYNC_POLL_MS = 2000;

/** Joins the Diddy Options room of every joined space (after the first sync, then every 10 min). */
export const useDiddyOptionsAutoJoin = (): void => {
  const mx = useMatrixClient();

  useEffect(() => {
    let disposed = false;
    let running = false;

    const runAll = async () => {
      if (running || disposed || !mx.isInitialSyncComplete()) return;
      running = true;
      try {
        const spaceIds = mx
          .getRooms()
          .filter((room) => room.isSpaceRoom() && room.getMyMembership() === 'join')
          .map((room) => room.roomId);
        for (let i = 0; i < spaceIds.length && !disposed; i += 1) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await joinOptionsRoomOfSpace(mx, spaceIds[i]);
          } catch {
            // ignore, retried on the next run
          }
        }
      } finally {
        running = false;
      }
    };

    const retryUntilSynced = window.setInterval(() => {
      if (mx.isInitialSyncComplete()) {
        window.clearInterval(retryUntilSynced);
        runAll();
      }
    }, SYNC_POLL_MS);
    const interval = window.setInterval(runAll, RECHECK_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(retryUntilSynced);
      window.clearInterval(interval);
    };
  }, [mx]);
};
