import React from 'react';
import { SystemNotification } from './SystemNotification';
import { AllMessagesNotifications } from './AllMessages';
import { SpecialMessagesNotifications } from './SpecialMessages';
import { KeywordMessagesNotifications } from './KeywordMessages';
import { InsetGroup, InsetRow, InsetSection, SettingsPage } from '../inset-list';

type NotificationsProps = {
  requestClose: () => void;
};
export function Notifications({ requestClose }: NotificationsProps) {
  return (
    <SettingsPage title="Notifications" requestClose={requestClose}>
      <SystemNotification />
      <AllMessagesNotifications />
      <SpecialMessagesNotifications />
      <KeywordMessagesNotifications />
      <InsetSection title="Block Messages">
        <InsetGroup>
          <InsetRow
            description={'This option has been moved to "Account > Blocked Users" section.'}
          />
        </InsetGroup>
      </InsetSection>
    </SettingsPage>
  );
}
