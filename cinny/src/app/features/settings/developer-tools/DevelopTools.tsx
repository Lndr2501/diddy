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

type DeveloperToolsProps = {
  requestClose: () => void;
};
export function DeveloperTools({ requestClose }: DeveloperToolsProps) {
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
    <SettingsPage title="Developer Tools" requestClose={requestClose}>
      <InsetSection title="Options">
        <InsetGroup>
          <InsetRow
            title="Enable Developer Tools"
            after={<Switch variant="Primary" value={developerTools} onChange={setDeveloperTools} />}
          />
          {developerTools && (
            <InsetRow
              title="Access Token"
              description="Copy access token to clipboard."
              after={
                <Button
                  className={sheetCss.Pill}
                  onClick={() => copyToClipboard(mx.getAccessToken() ?? '<NO_ACCESS_TOKEN_FOUND>')}
                  variant="Secondary"
                  fill="Soft"
                  size="300"
                  radii="Pill"
                >
                  <Text size="B300">Copy</Text>
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
