import React, { useCallback, useState } from 'react';
import { Text, Switch, Button } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  AccountDataEditor,
  AccountDataSubmitCallback,
} from '../../../components/AccountDataEditor';
import { copyToClipboard } from '../../../utils/dom';
import { AccountData } from './AccountData';
import { InsetGroup, InsetRow, InsetSection, SettingsPage } from '../inset-list';
import * as sheetCss from '../../../components/sheet/Sheet.css';
import { useTranslation } from 'react-i18next';

type DeveloperToolsProps = {
  requestClose: () => void;
};
export function DeveloperTools({ requestClose }: DeveloperToolsProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const [developerTools, setDeveloperTools] = useSetting(settingsAtom, 'developerTools');
  const [expand, setExpend] = useState(false);
  const [accountDataType, setAccountDataType] = useState<string | null>();

  const submitAccountData: AccountDataSubmitCallback = useCallback(
    async (type, content) => {
      await mx.setAccountData(type as never, content as never);
    },
    [mx]
  );

  if (accountDataType !== undefined) {
    return (
      <AccountDataEditor
        type={accountDataType ?? undefined}
        content={
          accountDataType ? mx.getAccountData(accountDataType as never)?.getContent() : undefined
        }
        submitChange={submitAccountData}
        requestClose={() => setAccountDataType(undefined)}
      />
    );
  }

  return (
    <SettingsPage title={t('settings.developTools.developerTools')} requestClose={requestClose}>
      <InsetSection title={t('settings.developTools.options')}>
        <InsetGroup>
          <InsetRow
            title={t('settings.developTools.enableDeveloperTools')}
            after={<Switch variant="Primary" value={developerTools} onChange={setDeveloperTools} />}
          />
          {developerTools && (
            <InsetRow
              title={t('settings.developTools.accessToken')}
              description={t('settings.developTools.copyAccessTokenTo')}
              after={
                <Button
                  className={sheetCss.Pill}
                  onClick={() => copyToClipboard(mx.getAccessToken() ?? '<NO_ACCESS_TOKEN_FOUND>')}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="Pill"
                >
                  <Text size="B300">{t('settings.developTools.copy')}</Text>
                </Button>
              }
            />
          )}
        </InsetGroup>
      </InsetSection>
      {developerTools && (
        <AccountData expand={expand} onExpandToggle={setExpend} onSelect={setAccountDataType} />
      )}
    </SettingsPage>
  );
}
