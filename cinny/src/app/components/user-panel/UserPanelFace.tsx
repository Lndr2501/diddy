import React from 'react';
import { MatrixClient } from 'matrix-js-sdk';
import { Avatar, Icon, Icons, Text } from 'folds';
import * as css from './UserPanel.css';
import { UserAvatar } from '../user-avatar';
import { DiddyStatus } from '../../plugins/diddy/types';
import { mxcUrlToHttp } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';
import { StatusIcon } from '../presence/StatusIcon';
import { stateOfChosen } from '../../utils/presenceState';
import { useTranslation } from 'react-i18next';
import { translate } from '../../i18n';

/*
 * The visible part of the user panel's profile button (#105): kept apart from UserPanel, which
 * opens the settings, so the profile editor's preview can draw it without an import cycle.
 */

export const STATUS_OPTIONS: {
  status: DiddyStatus;
  label: string;
  /** For the narrow user panel line, where "Do Not Disturb" was cut to "Do Not Di…" (#155). */
  short?: string;
  description?: string;
}[] = [
  {
    status: 'online',
    get label() {
      return translate('common.userPanel.online');
    },
  },
  {
    status: 'idle',
    get label() {
      return translate('common.userPanel.idle');
    },
  },
  {
    status: 'dnd',
    get label() {
      return translate('common.userPanel.doNotDisturb');
    },
    get short() {
      return translate('common.userPanel.busy');
    },
    get description() {
      return translate('common.userPanel.mutesSoundsAndNotifications');
    },
  },
  {
    status: 'invisible',
    get label() {
      return translate('common.userPanel.invisible');
    },
  },
];

export const statusInfo = (status: DiddyStatus) =>
  STATUS_OPTIONS.find((o) => o.status === status) ?? STATUS_OPTIONS[0];

/** Your picture in the user panel and the account menu. */
export const userPanelAvatarUrl = (
  mx: MatrixClient,
  avatarMxc: string | undefined,
  useAuthentication: boolean
): string | undefined =>
  avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

type UserPanelFaceProps = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: DiddyStatus;
  agentTalking?: boolean;
};
/**
 * What the profile button of the user panel shows: picture with status dot, name, status. Also
 * drawn by the profile editor's preview with the draft status (#105).
 */
export function UserPanelFace({
  userId,
  displayName,
  avatarUrl,
  status,
  agentTalking,
}: UserPanelFaceProps) {
  const { t } = useTranslation();
  const { label: chosenLabel, short } = statusInfo(status);
  const statusLabel = agentTalking ? t('common.userPanel.talkingToAgent') : chosenLabel;
  const statusShown = agentTalking ? statusLabel : short ?? chosenLabel;
  return (
    <>
      <span className={css.UserPanelAvatarWrap}>
        <Avatar size={agentTalking ? '400' : '300'} radii="Pill">
          <UserAvatar
            surface="account"
            userId={userId}
            src={avatarUrl}
            renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
          />
        </Avatar>
        {agentTalking && <span className={css.UserPanelAgentRing} aria-hidden />}
        <span className={css.UserPanelOnlineDot} aria-hidden>
          <StatusIcon state={stateOfChosen(status)} size={12} decorative />
        </span>
      </span>
      <div className={css.UserPanelText}>
        <Text size="T300" priority="500" truncate>
          <b>{displayName}</b>
        </Text>
        {agentTalking ? (
          <span className={css.UserPanelAgentBadge} role="status" aria-label={statusLabel}>
            <Icon size="50" src={Icons.Mic} filled />
            {t('common.userPanel.agent')}
          </span>
        ) : (
          <Text size="T200" priority="300" truncate title={statusLabel}>
            {statusShown}
          </Text>
        )}
      </div>
    </>
  );
}

/** The user panel's profile area without its buttons and menu (profile editor preview, #105). */
export function UserPanelPreview(props: UserPanelFaceProps) {
  return (
    <div className={css.UserPanel}>
      <div className={css.UserPanelProfileButton}>
        <UserPanelFace {...props} />
      </div>
    </div>
  );
}
