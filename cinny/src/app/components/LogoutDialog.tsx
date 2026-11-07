import React, { forwardRef, useCallback } from 'react';
import { Dialog, Text, Button, Spinner, color } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { logoutClient } from '../../client/initMatrix';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useCrossSigningActive } from '../hooks/useCrossSigning';
import { InfoCard } from './info-card';
import { AppLogo } from './app-logo/AppLogo';
import * as sheetCss from './sheet/Sheet.css';
import {
  useDeviceVerificationStatus,
  VerificationStatus,
} from '../hooks/useDeviceVerificationStatus';

type LogoutDialogProps = {
  handleClose: () => void;
};
export const LogoutDialog = forwardRef<HTMLDivElement, LogoutDialogProps>(
  ({ handleClose }, ref) => {
    const mx = useMatrixClient();
    const hasEncryptedRoom = !!mx.getRooms().find((room) => room.hasEncryptionStateEvent());
    const crossSigningActive = useCrossSigningActive();
    const verificationStatus = useDeviceVerificationStatus(
      mx.getCrypto(),
      mx.getSafeUserId(),
      mx.getDeviceId() ?? undefined
    );

    const [logoutState, logout] = useAsyncCallback<void, Error, []>(
      useCallback(async () => {
        await logoutClient(mx);
      }, [mx])
    );

    const ongoingLogout = logoutState.status === AsyncStatus.Loading;

    return (
      <Dialog variant="Surface" className={sheetCss.Alert} ref={ref}>
        <div className={sheetCss.AlertBody}>
          <AppLogo className={sheetCss.AlertIcon} size={64} />
          <Text as="h2" className={sheetCss.AlertTitle}>
            Logout
          </Text>
          <Text as="p" className={sheetCss.AlertText}>
            You’re about to log out. Are you sure?
          </Text>
          {hasEncryptedRoom &&
            (crossSigningActive ? (
              verificationStatus === VerificationStatus.Unverified && (
                <div data-alert-content>
                  <InfoCard
                    variant="Critical"
                    title="Unverified Device"
                    description="Verify your device before logging out to save your encrypted messages."
                  />
                </div>
              )
            ) : (
              <div data-alert-content>
                <InfoCard
                  variant="Critical"
                  title="Alert"
                  description="Enable device verification or export your encrypted data from settings to avoid losing access to your messages."
                />
              </div>
            ))}
          {logoutState.status === AsyncStatus.Error && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Failed to logout! {logoutState.error.message}
            </Text>
          )}
          <div className={sheetCss.AlertActions}>
            <Button
              className={sheetCss.Pill}
              variant="Critical"
              onClick={logout}
              disabled={ongoingLogout}
              before={ongoingLogout && <Spinner variant="Critical" fill="Solid" size="200" />}
            >
              <Text size="B400">Logout</Text>
            </Button>
            <Button
              className={sheetCss.Pill}
              variant="Secondary"
              fill="Soft"
              onClick={handleClose}
              disabled={ongoingLogout}
            >
              <Text size="B400">Cancel</Text>
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }
);
