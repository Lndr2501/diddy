import { useEffect } from 'react';
import { MatrixEvent, Room, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { connectMarkedRooms, joinOptionsRoomOfSpace } from './optionsRoom';
import { setVisibleInterval } from '../../utils/visibleInterval';

const RECHECK_INTERVAL_MS = 10 * 60 * 1000;
const SYNC_POLL_MS = 2000;
/** After joining a space or a room, its state needs a moment to arrive. */
const SOON_MS = 3000;

/**
 * Joins the Diddy Options room of every joined space and connects joined Diddy rooms without the
 * marker (connectMarkedRooms). Runs after the first sync, right after you join a space or a room,
 * when a space gets a new room, and every 10 minutes, so nothing has to be set up by hand.
 */
export const useDiddyOptionsAutoJoin = (): void => {
  const mx = useMatrixClient();

  useEffect(() => {
    let disposed = false;
    let running = false;
    let again = false;
    let soonTimer: number | undefined;

    const runAll = async () => {
      if (disposed || !mx.isInitialSyncComplete()) return;
      if (running) {
        // something changed while a run was going on: run once more afterwards
        again = true;
        return;
      }
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
        if (!disposed) connectMarkedRooms(mx);
      } finally {
        running = false;
      }
      if (again && !disposed) {
        again = false;
        runAll();
      }
    };

    const runSoon = () => {
      window.clearTimeout(soonTimer);
      soonTimer = window.setTimeout(runAll, SOON_MS);
    };

    // a new space or a newly joined room (also the options room joined above, to connect it)
    const onMembership = (_room: Room, membership: string) => {
      if (membership === 'join') runSoon();
    };
    // a space you are in got a new room: maybe its options room
    const onState = (event: MatrixEvent) => {
      if (event.getType() !== 'm.space.child') return;
      const space = mx.getRoom(event.getRoomId() ?? '');
      if (space?.getMyMembership() === 'join') runSoon();
    };

    const retryUntilSynced = window.setInterval(() => {
      if (mx.isInitialSyncComplete()) {
        window.clearInterval(retryUntilSynced);
        mx.on(RoomEvent.MyMembership, onMembership);
        mx.on(RoomStateEvent.Events, onState);
        runAll();
      }
    }, SYNC_POLL_MS);
    const stopRecheck = setVisibleInterval(runAll, RECHECK_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(retryUntilSynced);
      window.clearTimeout(soonTimer);
      mx.off(RoomEvent.MyMembership, onMembership);
      mx.off(RoomStateEvent.Events, onState);
      stopRecheck();
    };
  }, [mx]);
};
