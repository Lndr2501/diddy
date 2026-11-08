import React, { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { Menu, Overlay, OverlayBackdrop, OverlayCenter, PopOut, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useUserRoomProfileState } from '../state/hooks/userRoomProfile';
import { UserRoomProfile } from './user-profile';
import { userRoomProfileAtom, UserRoomProfileState } from '../state/userRoomProfile';
import { useAllJoinedRoomsSet, useGetRoom } from '../hooks/useGetRoom';
import { stopPropagation } from '../utils/keyboard';
import { SpaceProvider } from '../hooks/useSpace';
import { RoomProvider } from '../hooks/useRoom';
import * as sheetCss from './sheet/Sheet.css';

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const { roomId, spaceId, userId, cords, position } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);
  // Only close what is still open: switching from the small popover to the big profile unmounts
  // the popover, and its focus trap reports that as a close.
  const close = useCallback(
    () => setUserRoomProfile((current) => (current === state ? undefined : current)),
    [setUserRoomProfile, state]
  );

  if (!room) return null;

  const profile = (
    <SpaceProvider value={space ?? null}>
      <RoomProvider value={room}>
        <UserRoomProfile userId={userId} large={state.large} />
      </RoomProvider>
    </SpaceProvider>
  );

  if (state.large) {
    return (
      <Overlay open backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: close,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu
              className={sheetCss.PopoverCard}
              style={{ width: `min(${toRem(600)}, calc(100vw - ${toRem(32)}))` }}
              role="dialog"
              aria-label="Profile"
            >
              {profile}
            </Menu>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    );
  }

  return (
    <PopOut
      anchor={cords}
      position={position ?? 'Top'}
      align="Start"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu className={sheetCss.PopoverCard} style={{ width: toRem(340) }}>
            {profile}
          </Menu>
        </FocusTrap>
      }
    />
  );
}

export function UserRoomProfileRenderer() {
  const state = useUserRoomProfileState();

  if (!state) return null;
  return <UserRoomProfileContextMenu state={state} />;
}
