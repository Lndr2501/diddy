import { Position, RectCords } from 'folds';
import { atom } from 'jotai';

export type UserRoomProfileState = {
  userId: string;
  roomId: string;
  spaceId?: string;
  cords: RectCords;
  position?: Position;
  /** the big profile: a centred window instead of the small popover next to the click */
  large?: boolean;
};

export const userRoomProfileAtom = atom<UserRoomProfileState | undefined>(undefined);
