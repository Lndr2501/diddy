import React from 'react';
import { MatrixId } from './MatrixId';
import { Profile } from './Profile';
import { ContactInformation } from './ContactInfo';
import { IgnoredUserList } from './IgnoredUserList';
import { SettingsPage } from '../inset-list';

type AccountProps = {
  requestClose: () => void;
};
export function Account({ requestClose }: AccountProps) {
  return (
    <SettingsPage title="Account" requestClose={requestClose}>
      <Profile />
      <MatrixId />
      <ContactInformation />
      <IgnoredUserList />
    </SettingsPage>
  );
}
