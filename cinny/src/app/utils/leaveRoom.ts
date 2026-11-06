import { MatrixClient } from 'matrix-js-sdk';

/**
 * Leaves a room and waits for the server. Sync reports the new membership later, and for rooms
 * where nobody else is left that can take very long or never arrive, which keeps the room in the
 * lists (cinnyapp/cinny#2459). So the local membership is updated as soon as the server accepted it.
 */
export const leaveRoom = async (mx: MatrixClient, roomId: string): Promise<void> => {
  await mx.leave(roomId);
  const room = mx.getRoom(roomId);
  if (room && room.getMyMembership() === 'join') {
    room.updateMyMembership('leave');
  }
};
