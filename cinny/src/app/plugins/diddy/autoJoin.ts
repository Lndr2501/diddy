import { useEffect } from 'react';
import { MatrixEvent, Room, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { connectMarkedRooms, createOptionsRoomIfMissing, joinOptionsRoomOfSpace } from './optionsRoom';
import { diag } from '../diagnostics';
import { setVisibleInterval } from '../../utils/visibleInterval';

const RECHECK_INTERVAL_MS = 10 * 60 * 1000;
const SYNC_POLL_MS = 2000;
/** After joining a space or a room, its state needs a moment to arrive. */
const SOON_MS = 3000;
/**
 * Rooms are only created a while after the start, at a random moment: when two of your devices
 * start together, the first one's claim (account data) reaches the other one before it looks.
 */
const CREATE_AFTER_MS = 60 * 1000;
const CREATE_JITTER_MS = 30 * 1000;

/**
 * Joins the Diddy Options room of every joined space and connects joined Diddy rooms without the
 * marker (connectMarkedRooms). Runs after the first sync, right after you join a space or a room,
 * when a space gets a new room, and every 10 minutes, so nothing has to be set up by hand.
 * Spaces you created yourself without a Diddy room get one (createOptionsRoomIfMissing).
 */
export const useDiddyOptionsAutoJoin = (): void => {
  const mx = useMatrixClient();

  useEffect(() => {
    let disposed = false;
    let running = false;
    let again = false;
    let soonTimer: number | undefined;
    const createFrom = Date.now() + CREATE_AFTER_MS + Math.random() * CREATE_JITTER_MS;

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
        if (Date.now() >= createFrom) {
          for (let i = 0; i < spaceIds.length && !disposed; i += 1) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await createOptionsRoomIfMissing(mx, spaceIds[i]);
            } catch (e) {
              diag(`diddy: could not create the options room of a space: ${e instanceof Error ? e.message : String(e)}`);
            }
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
    // the first run that may create rooms
    const createTimer = window.setTimeout(runAll, createFrom - Date.now() + 1000);
    return () => {
      disposed = true;
      window.clearInterval(retryUntilSynced);
      window.clearTimeout(soonTimer);
      window.clearTimeout(createTimer);
      mx.off(RoomEvent.MyMembership, onMembership);
      mx.off(RoomStateEvent.Events, onState);
      stopRecheck();
    };
  }, [mx]);
};
