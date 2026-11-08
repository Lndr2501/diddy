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
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useDiddyProfile } from '../plugins/diddy/profiles';
import { ProfileFrameBox } from './diddy/ProfileFrame';

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const { roomId, spaceId, userId, cords, position } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const setUserRoomProfile = useSetAtom(userRoomProfileAtom);
  // the frame (#87) sticks out over the card, so it goes around the clipping popover / dialog
  const mx = useMatrixClient();
  const frame = useDiddyProfile(mx, userId)?.frame;
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
            <ProfileFrameBox frame={frame} width={toRem(600)} available={`100vw - ${toRem(32)}`}>
              <Menu
                className={sheetCss.PopoverCard}
                style={{ width: '100%' }}
                role="dialog"
                aria-label="Profile"
              >
                {profile}
              </Menu>
            </ProfileFrameBox>
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
          <ProfileFrameBox frame={frame} width={toRem(340)} available={`100vw - ${toRem(16)}`}>
            <Menu className={sheetCss.PopoverCard} style={{ width: '100%' }}>
              {profile}
            </Menu>
          </ProfileFrameBox>
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
