import {
  Box,
  Button,
  color,
  config,
  Dialog,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
} from 'folds';
import React, { FormEventHandler, useCallback, useEffect, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../../utils/keyboard';
import * as sheetCss from '../sheet/Sheet.css';
import { useRoom } from '../../hooks/useRoom';
import { CutoutCard } from '../cutout-card';
import { SettingTile } from '../setting-tile';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { BreakWord } from '../../styles/Text.css';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { timeDayMonYear, timeHourMinute } from '../../utils/time';
import { useTranslation } from 'react-i18next';
import { translate } from '../../i18n';

type UserKickAlertProps = {
  reason?: string;
  kickedBy?: string;
  ts?: number;
};
export function UserKickAlert({ reason, kickedBy, ts }: UserKickAlertProps) {
  const { t } = useTranslation();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const time = ts ? timeHourMinute(ts, hour24Clock) : undefined;
  const date = ts ? timeDayMonYear(ts, dateFormatString) : undefined;

  return (
    <CutoutCard style={{ padding: config.space.S200 }} variant="Critical">
      <SettingTile>
        <Box direction="Column" gap="200">
          <Box gap="200" justifyContent="SpaceBetween">
            <Text size="L400">{t('profile.moderation.kickedUser')}</Text>
            {time && date && (
              <Text size="T200">
                {date} {time}
              </Text>
            )}
          </Box>
          <Box direction="Column">
            {kickedBy && (
              <Text size="T200">
                {t('profile.moderation.kickedBy')} <b>{kickedBy}</b>
              </Text>
            )}
            <Text size="T200">
              {reason ? (
                <>
                  {t('profile.moderation.reason')} <b>{reason}</b>
                </>
              ) : (
                <i>{t('profile.moderation.noReasonProvided')}</i>
              )}
            </Text>
          </Box>
        </Box>
      </SettingTile>
    </CutoutCard>
  );
}

type UserBanAlertProps = {
  userId: string;
  reason?: string;
  canUnban?: boolean;
  bannedBy?: string;
  ts?: number;
};
export function UserBanAlert({ userId, reason, canUnban, bannedBy, ts }: UserBanAlertProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const room = useRoom();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const time = ts ? timeHourMinute(ts, hour24Clock) : undefined;
  const date = ts ? timeDayMonYear(ts, dateFormatString) : undefined;

  const [unbanState, unban] = useAsyncCallback<undefined, Error, []>(
    useCallback(async () => {
      await mx.unban(room.roomId, userId);
    }, [mx, room, userId])
  );
  const banning = unbanState.status === AsyncStatus.Loading;
  const error = unbanState.status === AsyncStatus.Error;

  return (
    <CutoutCard style={{ padding: config.space.S200 }} variant="Critical">
      <SettingTile>
        <Box direction="Column" gap="200">
          <Box gap="200" justifyContent="SpaceBetween">
            <Text size="L400">{t('profile.moderation.bannedUser')}</Text>
            {time && date && (
              <Text size="T200">
                {date} {time}
              </Text>
            )}
          </Box>
          <Box direction="Column">
            {bannedBy && (
              <Text size="T200">
                {t('profile.moderation.bannedBy')} <b>{bannedBy}</b>
              </Text>
            )}
            <Text size="T200">
              {reason ? (
                <>
                  {t('profile.moderation.reason')} <b>{reason}</b>
                </>
              ) : (
                <i>{t('profile.moderation.noReasonProvided')}</i>
              )}
            </Text>
          </Box>
          {error && (
            <Text className={BreakWord} size="T200" style={{ color: color.Critical.Main }}>
              <b>{unbanState.error.message}</b>
            </Text>
          )}
          {canUnban && (
            <Button
              size="300"
              variant="Critical"
              radii="400"
              onClick={ignoreRejection(unban)}
              before={banning && <Spinner size="100" variant="Critical" fill="Solid" />}
              disabled={banning}
            >
              <Text size="B300">{t('profile.moderation.unban')}</Text>
            </Button>
          )}
        </Box>
      </SettingTile>
    </CutoutCard>
  );
}

type UserInviteAlertProps = {
  userId: string;
  reason?: string;
  canKick?: boolean;
  invitedBy?: string;
  ts?: number;
};
export function UserInviteAlert({ userId, reason, canKick, invitedBy, ts }: UserInviteAlertProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const room = useRoom();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const time = ts ? timeHourMinute(ts, hour24Clock) : undefined;
  const date = ts ? timeDayMonYear(ts, dateFormatString) : undefined;

  const [kickState, kick] = useAsyncCallback<undefined, Error, []>(
    useCallback(async () => {
      await mx.kick(room.roomId, userId);
    }, [mx, room, userId])
  );
  const kicking = kickState.status === AsyncStatus.Loading;
  const error = kickState.status === AsyncStatus.Error;

  return (
    <CutoutCard style={{ padding: config.space.S200 }} variant="Success">
      <SettingTile>
        <Box direction="Column" gap="200">
          <Box gap="200" justifyContent="SpaceBetween">
            <Text size="L400">{t('profile.moderation.invitedUser')}</Text>
            {time && date && (
              <Text size="T200">
                {date} {time}
              </Text>
            )}
          </Box>
          <Box direction="Column">
            {invitedBy && (
              <Text size="T200">
                {t('profile.moderation.invitedBy')} <b>{invitedBy}</b>
              </Text>
            )}
            <Text size="T200">
              {reason ? (
                <>
                  {t('profile.moderation.reason')} <b>{reason}</b>
                </>
              ) : (
                <i>{t('profile.moderation.noReasonProvided')}</i>
              )}
            </Text>
          </Box>
          {error && (
            <Text className={BreakWord} size="T200" style={{ color: color.Critical.Main }}>
              <b>{kickState.error.message}</b>
            </Text>
          )}
          {canKick && (
            <Button
              size="300"
              variant="Success"
              fill="Soft"
              outlined
              radii="400"
              onClick={ignoreRejection(kick)}
              before={kicking && <Spinner size="100" variant="Success" fill="Soft" />}
              disabled={kicking}
            >
              <Text size="B300">{t('profile.moderation.cancelInvite')}</Text>
            </Button>
          )}
        </Box>
      </SettingTile>
    </CutoutCard>
  );
}

export type ModerationAction = 'invite' | 'kick' | 'ban';

const ACTION_TEXT: Record<ModerationAction, { title: string; text: string; button: string }> = {
  invite: {
    get title() {
      return translate('profile.moderation.invite');
    },
    text: 'will be invited back to this room.',
    get button() {
      return translate('profile.moderation.invite');
    },
  },
  kick: {
    get title() {
      return translate('profile.moderation.kick');
    },
    text: 'will be removed from this room. They can rejoin if the room allows it.',
    get button() {
      return translate('profile.moderation.kick');
    },
  },
  ban: {
    get title() {
      return translate('profile.moderation.ban');
    },
    text: 'will be removed from this room and cannot rejoin until unbanned.',
    get button() {
      return translate('profile.moderation.ban');
    },
  },
};

type ModerationPromptProps = {
  userId: string;
  displayName: string;
  action: ModerationAction;
  onClose: () => void;
};
/** Confirmation dialog with an optional reason, opened from the profile card's options menu. */
export function ModerationPrompt({ userId, displayName, action, onClose }: ModerationPromptProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const room = useRoom();
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const text = ACTION_TEXT[action];

  const [state, run] = useAsyncCallback<undefined, Error, []>(
    useCallback(async () => {
      const reason = reasonInputRef.current?.value.trim() || undefined;
      if (action === 'kick') await mx.kick(room.roomId, userId, reason);
      else if (action === 'ban') await mx.ban(room.roomId, userId, reason);
      else await mx.invite(room.roomId, userId, reason);
    }, [mx, room, userId, action])
  );
  const busy = state.status === AsyncStatus.Loading;

  useEffect(() => {
    if (state.status === AsyncStatus.Success) onClose();
  }, [state, onClose]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!busy) run();
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop className={sheetCss.Backdrop} />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: () => reasonInputRef.current ?? false,
            onDeactivate: onClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" className={sheetCss.Alert}>
            <form className={sheetCss.AlertBody} onSubmit={handleSubmit}>
              <Text as="h2" className={sheetCss.AlertTitle}>
                {text.title} {displayName}?
              </Text>
              <Text as="p" className={sheetCss.AlertText}>
                {displayName} {text.text}
              </Text>
              <Input
                ref={reasonInputRef}
                placeholder={t('profile.moderation.reasonOptional')}
                size="400"
                variant="Background"
                radii="400"
                disabled={busy}
                style={{ width: '100%' }}
              />
              {state.status === AsyncStatus.Error && (
                <Text style={{ color: color.Critical.Main }} className={BreakWord} size="T200">
                  <b>{state.error.message}</b>
                </Text>
              )}
              <div className={sheetCss.AlertActions}>
                <Button
                  className={sheetCss.Pill}
                  type="submit"
                  variant={action === 'invite' ? 'Primary' : 'Critical'}
                  before={
                    busy ? (
                      <Spinner
                        fill="Solid"
                        variant={action === 'invite' ? 'Primary' : 'Critical'}
                        size="200"
                      />
                    ) : undefined
                  }
                  aria-disabled={busy}
                >
                  <Text size="B400">{text.button}</Text>
                </Button>
                <Button
                  className={sheetCss.Pill}
                  type="button"
                  variant="Secondary"
                  fill="Soft"
                  onClick={onClose}
                >
                  <Text size="B400">{t('profile.moderation.cancel')}</Text>
                </Button>
              </div>
            </form>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
