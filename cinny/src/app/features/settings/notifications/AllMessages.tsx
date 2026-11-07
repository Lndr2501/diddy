import React, { useCallback, useMemo } from 'react';
import { Badge, Box, Text } from 'folds';
import { ConditionKind, IPushRules, PushRuleCondition, PushRuleKind, RuleId } from 'matrix-js-sdk';
import { useAccountData } from '../../../hooks/useAccountData';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { NotificationModeSwitcher } from './NotificationModeSwitcher';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { PushRuleData, usePushRule } from '../../../hooks/usePushRule';
import {
  getNotificationModeActions,
  NotificationMode,
  useNotificationModeActions,
} from '../../../hooks/useNotificationMode';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

const getAllMessageDefaultRule = (
  ruleId: RuleId,
  encrypted: boolean,
  oneToOne: boolean
): PushRuleData => {
  const conditions: PushRuleCondition[] = [];
  if (oneToOne)
    conditions.push({
      kind: ConditionKind.RoomMemberCount,
      is: '2',
    });
  conditions.push({
    kind: ConditionKind.EventMatch,
    key: 'type',
    pattern: encrypted ? 'm.room.encrypted' : 'm.room.message',
  });

  return {
    kind: PushRuleKind.Underride,
    pushRule: {
      rule_id: ruleId,
      default: true,
      enabled: true,
      conditions,
      actions: getNotificationModeActions(NotificationMode.NotifyLoud),
    },
  };
};

type PushRulesProps = {
  ruleId: RuleId.DM | RuleId.EncryptedDM | RuleId.Message | RuleId.EncryptedMessage;
  pushRules: IPushRules;
  encrypted?: boolean;
  oneToOne?: boolean;
};
function AllMessagesModeSwitcher({
  ruleId,
  pushRules,
  encrypted = false,
  oneToOne = false,
}: PushRulesProps) {
  const mx = useMatrixClient();
  const defaultPushRuleData = getAllMessageDefaultRule(ruleId, encrypted, oneToOne);
  const { kind, pushRule } = usePushRule(pushRules, ruleId) ?? defaultPushRuleData;
  const getModeActions = useNotificationModeActions();

  const handleChange = useCallback(
    async (mode: NotificationMode) => {
      const actions = getModeActions(mode);
      await mx.setPushRuleActions('global', kind, ruleId, actions);
    },
    [mx, getModeActions, kind, ruleId]
  );

  return <NotificationModeSwitcher pushRule={pushRule} onChange={handleChange} />;
}

export function AllMessagesNotifications() {
  const pushRulesEvt = useAccountData(AccountDataEvent.PushRules);
  const pushRules = useMemo(
    () => pushRulesEvt?.getContent<IPushRules>() ?? { global: {} },
    [pushRulesEvt]
  );

  return (
    <InsetSection
      title="All Messages"
      after={
        <Box gap="100" alignItems="Center">
          <Text size="T200" priority="300">
            Badge
          </Text>
          <Badge radii="300" variant="Secondary" fill="Solid">
            <Text size="L400">1</Text>
          </Badge>
        </Box>
      }
    >
      <InsetGroup>
        <InsetRow
          title="1-to-1 Chats"
          after={<AllMessagesModeSwitcher pushRules={pushRules} ruleId={RuleId.DM} oneToOne />}
        />
        <InsetRow
          title="1-to-1 Chats (Encrypted)"
          after={
            <AllMessagesModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.EncryptedDM}
              encrypted
              oneToOne
            />
          }
        />
        <InsetRow
          title="Rooms"
          after={<AllMessagesModeSwitcher pushRules={pushRules} ruleId={RuleId.Message} />}
        />
        <InsetRow
          title="Rooms (Encrypted)"
          after={
            <AllMessagesModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.EncryptedMessage}
              encrypted
            />
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
