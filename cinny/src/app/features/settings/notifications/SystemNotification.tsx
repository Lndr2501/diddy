import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, Switch, Button, color, Spinner } from 'folds';
import { IPusherRequest } from 'matrix-js-sdk';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { getNotificationState, usePermissionState } from '../../../hooks/usePermission';
import { useEmailNotifications } from '../../../hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useTranslation } from 'react-i18next';

function EmailNotification() {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  // Keep a stable reference of the last successful result to prevent UI flickering
  const stableResultRef = useRef(result);
  const stableResult = useMemo(() => {
    if (result !== undefined) return result;
    return stableResultRef.current;
  }, [result]);
  useEffect(() => {
    if (result !== undefined) stableResultRef.current = result;
  }, [result]);

  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (stableResult != null) setOptimisticEnabled(stableResult.enabled);
  }, [stableResult]);

  const [updateState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Diddy',
            },
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const loading = result === undefined || updateState.status === AsyncStatus.Loading;

  const handleChange = (value: boolean) => {
    if (!stableResult?.email) return;
    setOptimisticEnabled(value);
    setEnable(stableResult.email, value).then(
      () => refreshResult(),
      () => setOptimisticEnabled(stableResult.enabled)
    );
  };

  return (
    <InsetRow
      title={t('settings.systemNotification.emailNotification')}
      description={
        <>
          {stableResult && !stableResult.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {t('settings.systemNotification.yourAccountDoesNot')}
            </Text>
          )}
          {stableResult?.email && (
            <>{t('settings.systemNotification.sendNotificationToYour')}{' '}{`("${stableResult.email}")`}</>
          )}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {t('settings.systemNotification.unexpectedError')}
            </Text>
          )}
          {updateState.status === AsyncStatus.Error && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              {t('settings.systemNotification.failedToUpdatePlease')}
            </Text>
          )}
          {stableResult === undefined && t('settings.systemNotification.sendNotificationToYour')}
        </>
      }
      after={
        <Box gap="200" alignItems="Center">
          {loading && <Spinner variant="Secondary" />}
          {stableResult?.email && (
            <Switch
              variant="Primary"
              disabled={loading}
              value={optimisticEnabled ?? stableResult.enabled}
              onChange={handleChange}
            />
          )}
        </Box>
      }
    />
  );
}

export function SystemNotification() {
  const { t } = useTranslation();
  const notifPermission = usePermissionState('notifications', getNotificationState());
  const [showNotifications, setShowNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );

  const requestNotificationPermission = () => {
    window.Notification.requestPermission();
  };

  return (
    <InsetSection title={t('settings.systemNotification.system')}>
      <InsetGroup>
        <InsetRow
          title={t('settings.systemNotification.desktopNotifications')}
          description={
            notifPermission === 'denied' ? (
              <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                {'Notification' in window
                  ? t('settings.systemNotification.notificationPermissionIsBlocked')
                  : t('settings.systemNotification.notificationsAreNotSupported')}
              </Text>
            ) : (
              <span>{t('settings.systemNotification.showDesktopNotificationsWhen')}</span>
            )
          }
          after={
            notifPermission === 'prompt' ? (
              <Button size="300" radii="300" onClick={requestNotificationPermission}>
                <Text size="B300">{t('settings.systemNotification.enable')}</Text>
              </Button>
            ) : (
              <Switch
                variant="Primary"
                disabled={notifPermission !== 'granted'}
                value={showNotifications}
                onChange={setShowNotifications}
              />
            )
          }
        />
        <InsetRow
          title={t('settings.systemNotification.notificationSound')}
          description={t('settings.systemNotification.playASoundWhen')}
          after={
            <Switch
              variant="Primary"
              value={isNotificationSounds}
              onChange={setIsNotificationSounds}
            />
          }
        />
        <EmailNotification />
      </InsetGroup>
    </InsetSection>
  );
}
