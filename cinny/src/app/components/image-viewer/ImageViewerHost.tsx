import React from 'react';
import { useAtom } from 'jotai';
import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import { Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { imageViewerAtom } from '../../state/imageViewer';
import { ImageViewer } from './ImageViewer';
import { ModalWide } from '../../styles/Modal.css';
import * as sheetCss from '../sheet/Sheet.css';
import { ViewerFrame } from './ImageViewer.css';
import { stopPropagation } from '../../utils/keyboard';

export function ImageViewerHost() {
  const [image, setImage] = useAtom(imageViewerAtom);
  const close = () => setImage(undefined);

  return (
    <Overlay open={!!image} backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal
            className={classNames(ModalWide, sheetCss.Sheet, ViewerFrame)}
            size="500"
            onContextMenu={(evt: any) => evt.stopPropagation()}
          >
            {image && <ImageViewer src={image.src} alt={image.alt} requestClose={close} />}
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
