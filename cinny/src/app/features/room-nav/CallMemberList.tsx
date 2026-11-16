import React, { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Icon, Icons, Text } from 'folds';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { Room } from 'matrix-js-sdk';
import { UserAvatar } from '../../components/user-avatar';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { getMouseEventCords } from '../../utils/dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { openCallUserMenu } from '../../plugins/callFrameMenu';
import { CallControlEvent } from '../../plugins/call/CallControl';
import { callEmbedAtom } from '../../state/callEmbed';
import { callMutedUsersAtom, speakingUsersAtom } from '../../state/speakingUsers';
import * as css from './styles.css';
import { useTranslation } from 'react-i18next';

type CallMemberListProps = {
  room: Room;
  members: CallMembership[];
};

type CallAudioState = {
  /** people whose microphone is off */
  muted: ReadonlySet<string>;
  /** you have the headphones off (#160); Matrix does not carry that for the others */
  deafened: boolean;
};

const NO_ONE: ReadonlySet<string> = new Set();

/**
 * Who is muted in the call of `roomId`, from the call you are in (Matrix does not carry the mute
 * state of the others; CallSpeakingSync reads it from the call with the speakers), and whether
 * you are deafened. Empty when you are not in that call.
 */
function useCallAudioState(roomId: string): CallAudioState {
  const callEmbed = useAtomValue(callEmbedAtom);
  const inThisCall = !!callEmbed && callEmbed.roomId === roomId;
  const mutedInCall = useAtomValue(callMutedUsersAtom);
  const [deafened, setDeafened] = useState(false);

  useEffect(() => {
    if (!callEmbed || !inThisCall) {
      setDeafened(false);
      return undefined;
    }
    const update = () => setDeafened(!callEmbed.control.sound);
    update();
    callEmbed.control.on(CallControlEvent.StateUpdate, update);
    return () => {
      callEmbed.control.off(CallControlEvent.StateUpdate, update);
    };
  }, [callEmbed, inThisCall]);

  return { muted: inThisCall ? mutedInCall : NO_ONE, deafened: inThisCall && deafened };
}

/**
 * Who is in the call, one person per row right under the call room in the room list (like the
 * voice channels in Discord). Click opens the profile, right-click the person menu.
 */
export function CallMemberList({ room, members }: CallMemberListProps) {
  const { t } = useTranslation();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();
  const { muted: mutedUsers, deafened } = useCallAudioState(room.roomId);
  const myId = mx.getUserId();
  // who talks right now (held briefly, so the ring does not flicker between words)
  const speakingUsers = useAtomValue(speakingUsersAtom);

  const shown = members.filter((m) => !!m.userId);
  if (shown.length === 0) return null;

  return (
    <div className={css.CallMemberList} role="group" aria-label={t('nav.callMemberList.inTheCall')}>
      {shown.map((member) => {
        const userId = member.userId as string;
        const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
        const avatarMxc = getMemberAvatarMxc(room, userId);
        const src = avatarMxc
          ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 64, 64) ?? undefined
          : undefined;
        return (
          <button
            key={member.memberId}
            type="button"
            className={css.CallMemberRow}
            onContextMenu={(evt) => {
              evt.preventDefault();
              openCallUserMenu(userId, evt.clientX, evt.clientY);
            }}
            onClick={(evt) =>
              openUserProfile(
                room.roomId,
                undefined,
                userId,
                getMouseEventCords(evt.nativeEvent),
                'Right'
              )
            }
          >
            <Avatar
              size="200"
              radii="Pill"
              className={css.CallMemberRowAvatar}
              data-speaking={speakingUsers.has(userId)}
            >
              <UserAvatar
                surface="call"
                userId={userId}
                src={src}
                alt={name}
                renderFallback={() => <Icon size="50" src={Icons.User} filled />}
              />
            </Avatar>
            <Text as="span" size="T300" className={css.CallMemberRowName} truncate>
              {name}
            </Text>
            {(mutedUsers.has(userId) || (deafened && userId === myId)) && (
              <span className={css.CallMemberRowIcons}>
                {mutedUsers.has(userId) && (
                  <Icon
                    className={css.CallMemberRowMuted}
                    src={Icons.MicMute}
                    size="100"
                    filled
                    aria-label={t('nav.callMemberList.muted')}
                  />
                )}
                {deafened && userId === myId && (
                  <Icon
                    className={css.CallMemberRowMuted}
                    src={Icons.HeadphoneMute}
                    size="100"
                    filled
                    aria-label={t('nav.callMemberList.headphonesOff')}
                  />
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
