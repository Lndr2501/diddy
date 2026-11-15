import { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { RoomToUnread, Unread } from '../../../types/matrix/room';
import { roomToUnreadAtom, unreadEqual } from '../room/roomToUnread';

const compareUnreadEqual = (u1?: Unread, u2?: Unread): boolean => {
  if (!u1 || !u2) return false;
  return unreadEqual(u1, u2);
};

const getRoomsUnread = (rooms: string[], roomToUnread: RoomToUnread): Unread | undefined => {
  const unread = rooms.reduce<Unread | undefined>((u, roomId) => {
    const roomUnread = roomToUnread.get(roomId);
    if (!roomUnread) return u;
    const newUnread: Unread = u ?? {
      total: 0,
      highlight: 0,
      from: new Set(),
    };
    newUnread.total += roomUnread.total;
    newUnread.highlight += roomUnread.highlight;
    newUnread.from?.add(roomId);
    return newUnread;
  }, undefined);
  return unread;
};

const unreadRoomIds = (roomToUnread: RoomToUnread): ReadonlySet<string> => new Set(roomToUnread.keys());
const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && Array.from(a).every((id) => b.has(id));

/**
 * The rooms with anything unread. Changes only when a room becomes unread or read, not with every
 * new message (which changes the counts): the room lists only need to know which rooms to keep
 * in a closed category.
 */
export const useUnreadRoomIds = (roomToUnreadAtm: typeof roomToUnreadAtom): ReadonlySet<string> =>
  useAtomValue(selectAtom(roomToUnreadAtm, unreadRoomIds, sameIds));

export const useRoomsUnread = (
  rooms: string[],
  roomToUnreadAtm: typeof roomToUnreadAtom
): Unread | undefined => {
  const selector = useCallback(
    (roomToUnread: RoomToUnread) => getRoomsUnread(rooms, roomToUnread),
    [rooms]
  );
  return useAtomValue(selectAtom(roomToUnreadAtm, selector, compareUnreadEqual));
};

/**
 * Only whether the room has anything unread: a view that needs no counts does not re-render for
 * every new message (each one changes the counts).
 */
export const useRoomHasUnread = (
  roomId: string,
  roomToUnreadAtm: typeof roomToUnreadAtom
): boolean => {
  const selector = useCallback((roomToUnread: RoomToUnread) => roomToUnread.has(roomId), [roomId]);
  return useAtomValue(selectAtom(roomToUnreadAtm, selector));
};

export const useRoomUnread = (
  roomId: string,
  roomToUnreadAtm: typeof roomToUnreadAtom
): Unread | undefined => {
  const selector = useCallback((roomToUnread: RoomToUnread) => roomToUnread.get(roomId), [roomId]);
  return useAtomValue(selectAtom(roomToUnreadAtm, selector, compareUnreadEqual));
};
