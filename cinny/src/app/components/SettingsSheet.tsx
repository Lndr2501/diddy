import React, { ReactNode, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { Overlay, OverlayBackdrop } from 'folds';
import { stopPropagation } from '../utils/keyboard';
import { ScreenSize, useScreenSizeContext } from '../hooks/useScreenSize';
import { useHasCustomTitleBar } from './titlebar/TitleBar';
import * as css from './SettingsSheet.css';

type SettingsSheetProps = {
  requestClose: () => void;
  children: ReactNode;
  /** Accessible name of the dialog. */
  label?: string;
};
/**
 * The settings as a near full-window sheet (like System Settings on the Mac): it fills the window
 * with a small margin, rounded corners and a blurred backdrop, so the pages have room to breathe.
 * On macOS the overlay title bar (traffic lights) stays free and draggable; on phones the sheet
 * takes the whole window. Esc or a click on the backdrop closes it.
 */
export function SettingsSheet({ requestClose, children, label = 'Settings' }: SettingsSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleBar = useHasCustomTitleBar();
  const compact = useScreenSizeContext() === ScreenSize.Mobile;

  return (
    <Overlay open backdrop={<OverlayBackdrop className={css.Backdrop} />}>
      <FocusTrap
        focusTrapOptions={{
          // focus the sheet itself, not the first control, so Esc closes right away
          initialFocus: () => sheetRef.current ?? false,
          fallbackFocus: () => sheetRef.current ?? document.body,
          clickOutsideDeactivates: true,
          onDeactivate: requestClose,
          escapeDeactivates: stopPropagation,
        }}
      >
        <div className={css.Frame}>
          {titleBar && <div className={css.DragStrip} data-tauri-drag-region />}
          <div
            ref={sheetRef}
            className={css.Sheet}
            data-titlebar={titleBar}
            data-compact={compact}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
          >
            {children}
          </div>
        </div>
      </FocusTrap>
    </Overlay>
  );
}
