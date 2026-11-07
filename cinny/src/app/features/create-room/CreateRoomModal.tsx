import React from 'react';
import { Box, config, Modal, Overlay, OverlayBackdrop, OverlayCenter, Scroll, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { SpaceProvider } from '../../hooks/useSpace';
import { CreateRoomForm } from './CreateRoom';
import {
  useCloseCreateRoomModal,
  useCreateRoomModalState,
} from '../../state/hooks/createRoomModal';
import { CreateRoomModalState } from '../../state/createRoomModal';
import { stopPropagation } from '../../utils/keyboard';
import { SheetHeader } from '../../components/sheet';
import * as sheetCss from '../../components/sheet/Sheet.css';
import { CreateRoomType } from '../../components/create-room/types';

type CreateRoomModalProps = {
  state: CreateRoomModalState;
};
function CreateRoomModal({ state }: CreateRoomModalProps) {
  const { spaceId, type } = state;
  const closeDialog = useCloseCreateRoomModal();

  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const space = spaceId ? getRoom(spaceId) : undefined;

  return (
    <SpaceProvider value={space ?? null}>
      <Overlay open backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              clickOutsideDeactivates: true,
              onDeactivate: closeDialog,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal className={sheetCss.Sheet} size="300" flexHeight>
              <Box direction="Column">
                <SheetHeader
                  title={type === CreateRoomType.VoiceRoom ? 'New Voice Room' : 'New Chat Room'}
                  onClose={closeDialog}
                />
                <Scroll size="300" hideTrack>
                  <Box
                    style={{
                      padding: `${config.space.S200} ${config.space.S300} ${toRem(20)} ${toRem(
                        20
                      )}`,
                    }}
                    direction="Column"
                    gap="500"
                  >
                    <CreateRoomForm space={space} onCreate={closeDialog} defaultType={type} />
                  </Box>
                </Scroll>
              </Box>
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
    </SpaceProvider>
  );
}

export function CreateRoomModalRenderer() {
  const state = useCreateRoomModalState();

  if (!state) return null;
  return <CreateRoomModal state={state} />;
}
