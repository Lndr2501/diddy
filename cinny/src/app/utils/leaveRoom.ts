import { MatrixClient, Room, RoomEvent } from 'matrix-js-sdk';
import { diag } from '../plugins/diagnostics';

/**
 * Leaves a room and waits for the server. Sync reports the new membership later, and for rooms
 * where nobody else is left that can take very long or never arrive, which keeps the room in the
 * lists (cinnyapp/cinny#2459). On some servers the sync even keeps reporting the room as joined
 * (logged: "MyMembership leave -> join" right after the leave). So after the leave the room is
 * forgotten, which removes it from the client and makes the server stop sending it.
 */
export const leaveRoom = async (mx: MatrixClient, roomId: string): Promise<void> => {
  diag(`leave ${roomId}: start, membership=${mx.getRoom(roomId)?.getMyMembership()}`);
  const onMembership = (room: Room, membership: string, prev?: string) => {
    if (room.roomId === roomId) diag(`leave ${roomId}: MyMembership ${prev} -> ${membership}`);
  };
  mx.on(RoomEvent.MyMembership, onMembership);
  window.setTimeout(() => mx.off(RoomEvent.MyMembership, onMembership), 30000);
  try {
    await mx.leave(roomId);
  } catch (e) {
    diag(`leave ${roomId}: server error ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  const room = mx.getRoom(roomId);
  diag(`leave ${roomId}: server ok, local membership=${room?.getMyMembership()}`);
  if (room && room.getMyMembership() === 'join') {
    room.updateMyMembership('leave');
    diag(`leave ${roomId}: set local membership to leave`);
  }

  // Let a sync response that was already in flight finish first, then forget the room.
  await new Promise((resolve) => {
    window.setTimeout(resolve, 1500);
  });
  try {
    await mx.forget(roomId);
    diag(`leave ${roomId}: forgotten, still known locally=${!!mx.getRoom(roomId)}`);
  } catch (e) {
    diag(`leave ${roomId}: forget failed ${e instanceof Error ? e.message : String(e)}`);
  }
};
