import React, { forwardRef, useCallback } from 'react';
import { Dialog, Text, Button, Spinner, color } from 'folds';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../hooks/useAsyncCallback';
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
import { useTranslation } from 'react-i18next';

type LogoutDialogProps = {
  handleClose: () => void;
};
export const LogoutDialog = forwardRef<HTMLDivElement, LogoutDialogProps>(
  ({ handleClose }, ref) => {
    const { t } = useTranslation();
    const mx = useMatrixClient();
    const hasEncryptedRoom = !!mx.getRooms().find((room) => room.hasEncryptionStateEvent());
    const crossSigningActive = useCrossSigningActive();
    const verificationStatus = useDeviceVerificationStatus(
      mx.getCrypto(),
      mx.getSafeUserId(),
      mx.getDeviceId() ?? undefined
    );

    const [logoutState, logout] = useAsyncCallback<void, Error, [boolean]>(
      useCallback(
        async (localOnly: boolean) => {
          await logoutClient(mx, localOnly);
        },
        [mx]
      )
    );

    const ongoingLogout = logoutState.status === AsyncStatus.Loading;
    // The server did not end the session: retry, or remove it here and leave it signed in there.
    const failed = logoutState.status === AsyncStatus.Error;

    return (
      <Dialog variant="Surface" className={sheetCss.Alert} ref={ref}>
        <div className={sheetCss.AlertBody}>
          <AppLogo className={sheetCss.AlertIcon} size={64} />
          <Text as="h2" className={sheetCss.AlertTitle}>
            {t('common.logoutDialog.logout')}
          </Text>
          <Text as="p" className={sheetCss.AlertText}>
            {t('common.logoutDialog.youReAboutTo')}
          </Text>
          {hasEncryptedRoom &&
            (crossSigningActive ? (
              verificationStatus === VerificationStatus.Unverified && (
                <div data-alert-content>
                  <InfoCard
                    variant="Critical"
                    title={t('common.logoutDialog.unverifiedDevice')}
                    description={t('common.logoutDialog.verifyYourDeviceBefore')}
                  />
                </div>
              )
            ) : (
              <div data-alert-content>
                <InfoCard
                  variant="Critical"
                  title={t('common.logoutDialog.alert')}
                  description={t('common.logoutDialog.enableDeviceVerificationOr')}
                />
              </div>
            ))}
          {logoutState.status === AsyncStatus.Error && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              The server could not end this session ({logoutState.error.message}). If you remove it
              from this device anyway, it stays signed in on the server until you remove it under
              Devices on another device.
            </Text>
          )}
          <div className={sheetCss.AlertActions}>
            <Button
              className={sheetCss.Pill}
              variant="Critical"
              onClick={ignoreRejection(() => logout(false))}
              disabled={ongoingLogout}
              before={ongoingLogout && <Spinner variant="Critical" fill="Solid" size="200" />}
            >
              <Text size="B400">{failed ? 'Try Again' : 'Logout'}</Text>
            </Button>
            {failed && (
              <Button
                className={sheetCss.Pill}
                variant="Critical"
                fill="Soft"
                onClick={ignoreRejection(() => logout(true))}
                disabled={ongoingLogout}
              >
                <Text size="B400">Remove from This Device Anyway</Text>
              </Button>
            )}
            <Button
              className={sheetCss.Pill}
              variant="Secondary"
              fill="Soft"
              onClick={handleClose}
              disabled={ongoingLogout}
            >
              <Text size="B400">{t('common.logoutDialog.cancel')}</Text>
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }
);
