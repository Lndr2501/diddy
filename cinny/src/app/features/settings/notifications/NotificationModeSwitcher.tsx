import { IPushRule } from 'matrix-js-sdk';
import React, { useMemo } from 'react';
import { NotificationMode, useNotificationActionsMode } from '../../../hooks/useNotificationMode';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { SegmentedControl } from '../inset-list';
import { useTranslation } from 'react-i18next';

export const useNotificationModes = (): NotificationMode[] =>
  useMemo(() => [NotificationMode.NotifyLoud, NotificationMode.Notify, NotificationMode.OFF], []);

const useNotificationModeStr = (): Record<NotificationMode, string> =>
  {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      [NotificationMode.OFF]: t('settings.notificationModeSwitcher.disable'),
      [NotificationMode.Notify]: t('settings.notificationModeSwitcher.notifySilent'),
      [NotificationMode.NotifyLoud]: t('settings.notificationModeSwitcher.notifyLoud'),
    }),
    [t]
  );
};

// short labels for the segmented control, the long ones are shown as tooltip
const useNotificationModeShortStr = (): Record<NotificationMode, string> =>
  {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      [NotificationMode.OFF]: t('settings.notificationModeSwitcher.off'),
      [NotificationMode.Notify]: t('settings.notificationModeSwitcher.silent'),
      [NotificationMode.NotifyLoud]: t('settings.notificationModeSwitcher.sound'),
    }),
    [t]
  );
};

type NotificationModeSwitcherProps = {
  pushRule: IPushRule;
  onChange: (mode: NotificationMode) => Promise<void>;
};
export function NotificationModeSwitcher({ pushRule, onChange }: NotificationModeSwitcherProps) {
  const { t } = useTranslation();
  const modes = useNotificationModes();
  const modeToStr = useNotificationModeStr();
  const modeToShortStr = useNotificationModeShortStr();
  const selectedMode = useNotificationActionsMode(pushRule.actions);
  const [changeState, change] = useAsyncCallback(onChange);
  const changing = changeState.status === AsyncStatus.Loading;

  return (
    <SegmentedControl<NotificationMode>
      aria-label={t('settings.notificationModeSwitcher.notificationMode')}
      options={modes.map((mode) => ({
        value: mode,
        label: modeToShortStr[mode],
        title: modeToStr[mode],
      }))}
      value={selectedMode}
      onChange={(mode) => {
        change(mode);
      }}
      disabled={changing}
      loading={changing}
    />
  );
}
