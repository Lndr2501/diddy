import FocusTrap from 'focus-trap-react';
import { as, Modal, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { ModalWide } from '../styles/Modal.css';
import * as sheetCss from './sheet/Sheet.css';
import { ViewerFrame } from './image-viewer/ImageViewer.css';
import { stopPropagation } from '../utils/keyboard';

export type RenderViewerProps = {
  src: string;
  alt: string;
  requestClose: () => void;
};

type ImageOverlayProps = RenderViewerProps & {
  viewer: boolean;
  renderViewer: (props: RenderViewerProps) => ReactNode;
};

export const ImageOverlay = as<'div', ImageOverlayProps>(
  ({ src, alt, viewer, requestClose, renderViewer, ...props }, ref) => (
    <Overlay
      {...props}
      ref={ref}
      open={viewer}
      backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}
    >
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => requestClose(),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal
            className={classNames(ModalWide, sheetCss.Sheet, ViewerFrame)}
            size="500"
            onContextMenu={(evt: any) => evt.stopPropagation()}
          >
            {renderViewer({
              src,
              alt,
              requestClose,
            })}
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  )
);
