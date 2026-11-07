import React, { useCallback, useMemo } from 'react';
import { ConditionKind, IPushRules, PushRuleKind, RuleId } from 'matrix-js-sdk';
import { Box, Text, Badge } from 'folds';
import { useAccountData } from '../../../hooks/useAccountData';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { InsetGroup, InsetRow, InsetSection } from '../inset-list';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { makePushRuleData, PushRuleData, usePushRule } from '../../../hooks/usePushRule';
import {
  getNotificationModeActions,
  NotificationMode,
  NotificationModeOptions,
  useNotificationModeActions,
} from '../../../hooks/useNotificationMode';
import { NotificationModeSwitcher } from './NotificationModeSwitcher';

const NOTIFY_MODE_OPS: NotificationModeOptions = {
  highlight: true,
};
const getDefaultIsUserMention = (userId: string): PushRuleData =>
  makePushRuleData(
    PushRuleKind.Override,
    RuleId.IsUserMention,
    getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
    [
      {
        kind: ConditionKind.EventPropertyContains,
        key: 'content.m\\.mentions.user_ids',
        value: userId,
      },
    ]
  );

const DefaultContainsDisplayName = makePushRuleData(
  PushRuleKind.Override,
  RuleId.ContainsDisplayName,
  getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
  [
    {
      kind: ConditionKind.ContainsDisplayName,
    },
  ]
);

const getDefaultContainsUsername = (username: string) =>
  makePushRuleData(
    PushRuleKind.ContentSpecific,
    RuleId.ContainsUserName,
    getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
    undefined,
    username
  );

const DefaultIsRoomMention = makePushRuleData(
  PushRuleKind.Override,
  RuleId.IsRoomMention,
  getNotificationModeActions(NotificationMode.Notify, { highlight: true }),
  [
    {
      kind: ConditionKind.EventPropertyIs,
      key: 'content.m\\.mentions.room',
      value: true,
    },
    {
      kind: ConditionKind.SenderNotificationPermission,
      key: 'room',
    },
  ]
);

const DefaultAtRoomNotification = makePushRuleData(
  PushRuleKind.Override,
  RuleId.AtRoomNotification,
  getNotificationModeActions(NotificationMode.Notify, { highlight: true }),
  [
    {
      kind: ConditionKind.EventMatch,
      key: 'content.body',
      pattern: '@room',
    },
    {
      kind: ConditionKind.SenderNotificationPermission,
      key: 'room',
    },
  ]
);

type PushRulesProps = {
  ruleId: RuleId;
  pushRules: IPushRules;
  defaultPushRuleData: PushRuleData;
};
function MentionModeSwitcher({ ruleId, pushRules, defaultPushRuleData }: PushRulesProps) {
  const mx = useMatrixClient();

  const { kind, pushRule } = usePushRule(pushRules, ruleId) ?? defaultPushRuleData;
  const getModeActions = useNotificationModeActions(NOTIFY_MODE_OPS);

  const handleChange = useCallback(
    async (mode: NotificationMode) => {
      const actions = getModeActions(mode);
      await mx.setPushRuleActions('global', kind, ruleId, actions);
    },
    [mx, getModeActions, kind, ruleId]
  );

  return <NotificationModeSwitcher pushRule={pushRule} onChange={handleChange} />;
}

export function SpecialMessagesNotifications() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const { displayName } = useUserProfile(userId);
  const pushRulesEvt = useAccountData(AccountDataEvent.PushRules);
  const pushRules = useMemo(
    () => pushRulesEvt?.getContent<IPushRules>() ?? { global: {} },
    [pushRulesEvt]
  );

  return (
    <InsetSection
      title="Mentions"
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
          title="Mention User ID"
          description={userId}
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.IsUserMention}
              defaultPushRuleData={getDefaultIsUserMention(userId)}
            />
          }
        />
        <InsetRow
          title="Contains Display Name"
          description={displayName ? `"${displayName}"` : undefined}
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.ContainsDisplayName}
              defaultPushRuleData={DefaultContainsDisplayName}
            />
          }
        />
        <InsetRow
          title="Contains Username"
          description={`"${getMxIdLocalPart(userId)}"`}
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.ContainsUserName}
              defaultPushRuleData={getDefaultContainsUsername(getMxIdLocalPart(userId) ?? userId)}
            />
          }
        />
        <InsetRow
          title="Mention @room"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.IsRoomMention}
              defaultPushRuleData={DefaultIsRoomMention}
            />
          }
        />
        <InsetRow
          title="Contains @room"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.AtRoomNotification}
              defaultPushRuleData={DefaultAtRoomNotification}
            />
          }
        />
      </InsetGroup>
    </InsetSection>
  );
}
