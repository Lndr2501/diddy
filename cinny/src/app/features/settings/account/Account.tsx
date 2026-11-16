import React from 'react';
import { MatrixId } from './MatrixId';
import { Profile } from './Profile';
import { ConnectedAccounts } from './ConnectedAccounts';
import { ContactInformation } from './ContactInfo';
import { IgnoredUserList } from './IgnoredUserList';
import { SettingsPage } from '../inset-list';
import { useTranslation } from 'react-i18next';

type AccountProps = {
  requestClose: () => void;
};
export function Account({ requestClose }: AccountProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage title={t('settings.account.account')} requestClose={requestClose}>
      <Profile />
      <ConnectedAccounts />
      <MatrixId />
      <ContactInformation />
      <IgnoredUserList />
    </SettingsPage>
  );
}
