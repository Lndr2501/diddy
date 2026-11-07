import React, { ChangeEventHandler, FormEventHandler, useCallback, useMemo, useState } from 'react';
import { IPushRule, IPushRules, PushRuleKind } from 'matrix-js-sdk';
import { Box, Text, Badge, Button, Input, config, IconButton, Icons, Icon, Spinner } from 'folds';
import { useAccountData } from '../../../hooks/useAccountData';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import {
  getNotificationModeActions,
  NotificationMode,
  NotificationModeOptions,
  useNotificationModeActions,
} from '../../../hooks/useNotificationMode';
import { NotificationModeSwitcher } from './NotificationModeSwitcher';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';

const NOTIFY_MODE_OPS: NotificationModeOptions = {
  highlight: true,
};

function KeywordInput() {
  const mx = useMatrixClient();
  const [keyword, setKeyword] = useState<string>('');

  const [keywordState, addKeyword] = useAsyncCallback(
    useCallback(
      async (k: string) => {
        mx.addPushRule('global', PushRuleKind.ContentSpecific, k, {
          actions: getNotificationModeActions(NotificationMode.Notify, NOTIFY_MODE_OPS),
          pattern: k,
        });
        setKeyword('');
      },
      [mx]
    )
  );
  const addingKeyword = keywordState.status === AsyncStatus.Loading;

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const k = evt.currentTarget.value;
    setKeyword(k);
  };

  const handleReset = () => {
    setKeyword('');
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (addingKeyword) return;

    const target = evt.target as HTMLFormElement | undefined;
    const keywordInput = target?.keywordInput as HTMLInputElement | undefined;
    const k = keywordInput?.value.trim();
    if (!k) return;

    addKeyword(k);
  };

  return (
    <Box as="form" onSubmit={handleSubmit} gap="200" aria-disabled={addingKeyword}>
      <Box grow="Yes" direction="Column">
        <Input
          required
          name="keywordInput"
          value={keyword}
          onChange={handleChange}
          variant="Secondary"
          radii="300"
          style={{ paddingRight: config.space.S200 }}
          readOnly={addingKeyword}
          after={
            keyword &&
            !addingKeyword && (
              <IconButton
                type="reset"
                onClick={handleReset}
                size="300"
                radii="300"
                variant="Secondary"
              >
                <Icon src={Icons.Cross} size="100" />
              </IconButton>
            )
          }
        />
      </Box>
      <Button
        size="400"
        variant="Secondary"
        fill="Soft"
        outlined
        radii="300"
        type="submit"
        disabled={addingKeyword}
      >
        {addingKeyword && <Spinner variant="Secondary" size="300" />}
        <Text size="B400">Save</Text>
      </Button>
    </Box>
  );
}

type PushRulesProps = {
  pushRule: IPushRule;
};

function KeywordCross({ pushRule }: PushRulesProps) {
  const mx = useMatrixClient();
  const [removeState, remove] = useAsyncCallback(
    useCallback(
      () => mx.deletePushRule('global', PushRuleKind.ContentSpecific, pushRule.rule_id),
      [mx, pushRule]
    )
  );

  const removing = removeState.status === AsyncStatus.Loading;
  return (
    <IconButton onClick={remove} size="300" radii="Pill" variant="Secondary" disabled={removing}>
      {removing ? <Spinner size="100" /> : <Icon src={Icons.Cross} size="100" />}
    </IconButton>
  );
}

function KeywordModeSwitcher({ pushRule }: PushRulesProps) {
  const mx = useMatrixClient();

  const getModeActions = useNotificationModeActions(NOTIFY_MODE_OPS);

  const handleChange = useCallback(
    async (mode: NotificationMode) => {
      const actions = getModeActions(mode);
      await mx.setPushRuleActions(
        'global',
        PushRuleKind.ContentSpecific,
        pushRule.rule_id,
        actions
      );
    },
    [mx, getModeActions, pushRule]
  );

  return <NotificationModeSwitcher pushRule={pushRule} onChange={handleChange} />;
}

export function KeywordMessagesNotifications() {
  const pushRulesEvt = useAccountData(AccountDataEvent.PushRules);
  const pushRules = useMemo(
    () => pushRulesEvt?.getContent<IPushRules>() ?? { global: {} },
    [pushRulesEvt]
  );

  const keywordPushRules = useMemo(() => {
    const content = pushRules.global.content ?? [];
    return content.filter(
      (pushRule) => pushRule.default === false && typeof pushRule.pattern === 'string'
    );
  }, [pushRules]);

  return (
    <InsetSection
      title="Keywords"
      after={
        <Box gap="100" alignItems="Center">
          <Text size="T200" priority="300">
            Badge
          </Text>
          <Badge radii="300" variant="Success" fill="Solid">
            <Text size="L400">1</Text>
          </Badge>
        </Box>
      }
    >
      <InsetGroup>
        <InsetRow
          title="Add Keyword"
          description="Set a notification preference for messages containing the given keyword."
        >
          <KeywordInput />
        </InsetRow>
        {keywordPushRules.map((pushRule) => (
          <InsetRow
            key={pushRule.rule_id}
            title={`"${pushRule.pattern}"`}
            before={<KeywordCross pushRule={pushRule} />}
            after={<KeywordModeSwitcher pushRule={pushRule} />}
          />
        ))}
      </InsetGroup>
    </InsetSection>
  );
}
