import { IPushRule } from 'matrix-js-sdk';
import React, { useMemo } from 'react';
import { NotificationMode, useNotificationActionsMode } from '../../../hooks/useNotificationMode';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { SegmentedControl } from '../inset-list';

export const useNotificationModes = (): NotificationMode[] =>
  useMemo(() => [NotificationMode.NotifyLoud, NotificationMode.Notify, NotificationMode.OFF], []);

const useNotificationModeStr = (): Record<NotificationMode, string> =>
  useMemo(
    () => ({
      [NotificationMode.OFF]: 'Disable',
      [NotificationMode.Notify]: 'Notify Silent',
      [NotificationMode.NotifyLoud]: 'Notify Loud',
    }),
    []
  );

// short labels for the segmented control, the long ones are shown as tooltip
const useNotificationModeShortStr = (): Record<NotificationMode, string> =>
  useMemo(
    () => ({
      [NotificationMode.OFF]: 'Off',
      [NotificationMode.Notify]: 'Silent',
      [NotificationMode.NotifyLoud]: 'Sound',
    }),
    []
  );

type NotificationModeSwitcherProps = {
  pushRule: IPushRule;
  onChange: (mode: NotificationMode) => Promise<void>;
};
export function NotificationModeSwitcher({ pushRule, onChange }: NotificationModeSwitcherProps) {
  const modes = useNotificationModes();
  const modeToStr = useNotificationModeStr();
  const modeToShortStr = useNotificationModeShortStr();
  const selectedMode = useNotificationActionsMode(pushRule.actions);
  const [changeState, change] = useAsyncCallback(onChange);
  const changing = changeState.status === AsyncStatus.Loading;

  return (
    <SegmentedControl<NotificationMode>
      aria-label="Notification mode"
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
