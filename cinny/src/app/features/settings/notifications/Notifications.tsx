import React from 'react';
import { SystemNotification } from './SystemNotification';
import { AllMessagesNotifications } from './AllMessages';
import { SpecialMessagesNotifications } from './SpecialMessages';
import { KeywordMessagesNotifications } from './KeywordMessages';
import { InsetGroup, InsetRow, InsetSection, SettingsPage } from '../inset-list';
import { useTranslation } from 'react-i18next';

type NotificationsProps = {
  requestClose: () => void;
};
export function Notifications({ requestClose }: NotificationsProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.notifications.notifications')} requestClose={requestClose}>
      <SystemNotification />
      <AllMessagesNotifications />
      <SpecialMessagesNotifications />
      <KeywordMessagesNotifications />
      <InsetSection title={t('settings.notifications.blockMessages')}>
        <InsetGroup>
          <InsetRow description={t('settings.notifications.thisOptionHasBeen')} />
        </InsetGroup>
      </InsetSection>
    </SettingsPage>
  );
}
