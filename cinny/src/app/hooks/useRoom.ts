import { Room } from 'matrix-js-sdk';
import { createContext, useContext } from 'react';

const RoomContext = createContext<Room | null>(null);

export const RoomProvider = RoomContext.Provider;

export function useRoom(): Room {
  const room = useContext(RoomContext);
  if (!room) throw new Error('Room not provided!');
  return room;
}

/**
 * The room of the surrounding view, or null outside of one. Message content is also drawn where no
 * room view exists (inbox notifications, search results), so it must not use useRoom() (#125).
 */
export function useOptionalRoom(): Room | null {
  return useContext(RoomContext);
}

const IsDirectRoomContext = createContext<boolean>(false);

export const IsDirectRoomProvider = IsDirectRoomContext.Provider;

export const useIsDirectRoom = () => {
  const direct = useContext(IsDirectRoomContext);

  return direct;
};
