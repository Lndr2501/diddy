import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Position, RectCords } from 'folds';
import { userRoomProfileAtom, UserRoomProfileState } from '../userRoomProfile';

export const useUserRoomProfileState = (): UserRoomProfileState | undefined => {
  const data = useAtomValue(userRoomProfileAtom);

  return data;
};

type CloseCallback = () => void;
export const useCloseUserRoomProfile = (): CloseCallback => {
  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);

  const close: CloseCallback = useCallback(() => {
    setUserRoomProfile(undefined);
  }, [setUserRoomProfile]);

  return close;
};

type OpenCallback = (
  roomId: string,
  spaceId: string | undefined,
  userId: string,
  cords: RectCords,
  position?: Position
) => void;
export const useOpenUserRoomProfile = (): OpenCallback => {
  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);

  const open: OpenCallback = useCallback(
    (roomId, spaceId, userId, cords, position) => {
      setUserRoomProfile({ roomId, spaceId, userId, cords, position });
    },
    [setUserRoomProfile]
  );

  return open;
};

type OpenLargeCallback = (roomId: string, userId: string) => void;
/** Open the big profile of `userId` (a centred window), in the context of `roomId`. */
export const useOpenLargeUserProfile = (): OpenLargeCallback => {
  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);

  return useCallback(
    (roomId, userId) => {
      setUserRoomProfile({
        roomId,
        userId,
        cords: { x: 0, y: 0, width: 0, height: 0 },
        large: true,
      });
    },
    [setUserRoomProfile]
  );
};
