import React from 'react';
import { Box, config, Modal, Overlay, OverlayBackdrop, OverlayCenter, Scroll, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAllJoinedRoomsSet, useGetRoom } from '../../hooks/useGetRoom';
import { SpaceProvider } from '../../hooks/useSpace';
import { CreateSpaceForm } from './CreateSpace';
import {
  useCloseCreateSpaceModal,
  useCreateSpaceModalState,
} from '../../state/hooks/createSpaceModal';
import { CreateSpaceModalState } from '../../state/createSpaceModal';
import { stopPropagation } from '../../utils/keyboard';
import { SheetHeader } from '../../components/sheet';
import * as sheetCss from '../../components/sheet/Sheet.css';

type CreateSpaceModalProps = {
  state: CreateSpaceModalState;
};
function CreateSpaceModal({ state }: CreateSpaceModalProps) {
  const { spaceId } = state;
  const closeDialog = useCloseCreateSpaceModal();

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
                <SheetHeader title="New Space" onClose={closeDialog} />
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
                    <CreateSpaceForm space={space} onCreate={closeDialog} />
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

export function CreateSpaceModalRenderer() {
  const state = useCreateSpaceModalState();

  if (!state) return null;
  return <CreateSpaceModal state={state} />;
}
