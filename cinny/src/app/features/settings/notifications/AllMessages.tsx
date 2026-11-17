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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const pushRulesEvt = useAccountData(AccountDataEvent.PushRules);
  const pushRules = useMemo(
    () => pushRulesEvt?.getContent<IPushRules>() ?? { global: {} },
    [pushRulesEvt]
  );

  return (
    <InsetSection
      title={t('settings.allMessages.allMessages')}
      after={
        <Box gap="100" alignItems="Center">
          <Text size="T200" priority="300">
            {t('settings.allMessages.badge')}
          </Text>
          <Badge radii="300" variant="Secondary" fill="Soft">
            <Text size="L400">1</Text>
          </Badge>
        </Box>
      }
    >
      <InsetGroup>
        <InsetRow
          title={t('settings.allMessages.n1To1Chats')}
          after={<AllMessagesModeSwitcher pushRules={pushRules} ruleId={RuleId.DM} oneToOne />}
        />
        <InsetRow
          title={t('settings.allMessages.n1To1Chats2')}
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
          title={t('settings.allMessages.rooms')}
          after={<AllMessagesModeSwitcher pushRules={pushRules} ruleId={RuleId.Message} />}
        />
        <InsetRow
          title={t('settings.allMessages.roomsEncrypted')}
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
