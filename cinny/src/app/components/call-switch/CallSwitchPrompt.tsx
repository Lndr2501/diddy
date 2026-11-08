import React from 'react';
import FocusTrap from 'focus-trap-react';
import { Button, color, Dialog, Overlay, OverlayBackdrop, OverlayCenter, Text } from 'folds';
import { stopPropagation } from '../../utils/keyboard';
import { AppLogo } from '../app-logo/AppLogo';
import * as sheetCss from '../sheet/Sheet.css';

export type CallSwitchAction = 'call' | 'join';

type CallSwitchPromptProps = {
  /** Name of the room the user is in a call in right now. */
  currentName: string;
  /** Name of the person (action "call") or the room (action "join") to switch to. */
  targetName: string;
  action: CallSwitchAction;
  /** Set when the switch failed: the dialog then only reports it. */
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function CallSwitchPrompt({
  currentName,
  targetName,
  action,
  error,
  onConfirm,
  onCancel,
}: CallSwitchPromptProps) {
  const text =
    action === 'call'
      ? `You're in a call in ${currentName}. Calling ${targetName} will end it for you.`
      : `You're in a call in ${currentName}. Joining ${targetName} will end it for you.`;

  return (
    <Overlay open backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: onCancel,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" className={sheetCss.Alert}>
            <div className={sheetCss.AlertBody}>
              <AppLogo className={sheetCss.AlertIcon} size={64} />
              <Text as="h2" className={sheetCss.AlertTitle}>
                {error ? 'Could not switch calls' : 'Leave your current call?'}
              </Text>
              {error ? (
                <Text as="p" className={sheetCss.AlertText} style={{ color: color.Critical.Main }}>
                  {error}
                </Text>
              ) : (
                <Text as="p" className={sheetCss.AlertText}>
                  {text}
                </Text>
              )}
              <div className={sheetCss.AlertActions}>
                {!error && (
                  <Button
                    className={sheetCss.Pill}
                    type="submit"
                    variant="Critical"
                    onClick={onConfirm}
                  >
                    <Text size="B400">
                      {action === 'call' ? 'Leave and call' : 'Leave and join'}
                    </Text>
                  </Button>
                )}
                <Button
                  className={sheetCss.Pill}
                  variant="Secondary"
                  fill="Soft"
                  onClick={onCancel}
                >
                  <Text size="B400">{error ? 'Close' : 'Cancel'}</Text>
                </Button>
              </div>
            </div>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
