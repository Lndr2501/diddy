import React, { useCallback, useEffect } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Dialog,
  Overlay,
  OverlayCenter,
  OverlayBackdrop,
  Text,
  color,
  Button,
  Spinner,
} from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { stopPropagation } from '../../utils/keyboard';
import { leaveRoom as leaveRoomAndSync } from '../../utils/leaveRoom';
import { AppLogo } from '../app-logo/AppLogo';
import * as sheetCss from '../sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

type LeaveRoomPromptProps = {
  roomId: string;
  onDone: () => void;
  onCancel: () => void;
};

export function LeaveRoomPrompt({ roomId, onDone, onCancel }: LeaveRoomPromptProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();

  const [leaveState, leaveRoom] = useAsyncCallback<undefined, MatrixError, []>(
    useCallback(async () => {
      await leaveRoomAndSync(mx, roomId);
    }, [mx, roomId])
  );

  const handleLeave = () => {
    leaveRoom();
  };

  useEffect(() => {
    if (leaveState.status === AsyncStatus.Success) {
      onDone();
    }
  }, [leaveState, onDone]);

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
                {t('common.leaveRoomPrompt.leaveRoom')}
              </Text>
              <Text as="p" className={sheetCss.AlertText}>
                {t('common.leaveRoomPrompt.areYouSureYou')}
              </Text>
              {leaveState.status === AsyncStatus.Error && (
                <Text style={{ color: color.Critical.Main }} size="T300">
                  {t('common.leaveRoomPrompt.failedToLeaveRoom', {
                    message: leaveState.error.message,
                  })}
                </Text>
              )}
              <div className={sheetCss.AlertActions}>
                <Button
                  className={sheetCss.Pill}
                  type="submit"
                  variant="Critical"
                  onClick={handleLeave}
                  before={
                    leaveState.status === AsyncStatus.Loading ? (
                      <Spinner fill="Solid" variant="Critical" size="200" />
                    ) : undefined
                  }
                  aria-disabled={
                    leaveState.status === AsyncStatus.Loading ||
                    leaveState.status === AsyncStatus.Success
                  }
                >
                  <Text size="B400">
                    {leaveState.status === AsyncStatus.Loading
                      ? t('common.leaveRoomPrompt.leaving')
                      : t('common.leaveRoomPrompt.leave')}
                  </Text>
                </Button>
                <Button
                  className={sheetCss.Pill}
                  variant="Secondary"
                  fill="Soft"
                  onClick={onCancel}
                >
                  <Text size="B400">{t('common.leaveRoomPrompt.cancel')}</Text>
                </Button>
              </div>
            </div>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
