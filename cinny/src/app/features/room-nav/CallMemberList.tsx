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
import { readCallStage } from '../../plugins/call/callStage';
import { CallControlEvent } from '../../plugins/call/CallControl';
import { callEmbedAtom } from '../../state/callEmbed';
import { speakingUsersAtom } from '../../state/speakingUsers';
import * as css from './styles.css';

type CallMemberListProps = {
  room: Room;
  members: CallMembership[];
};

const MUTE_POLL_MS = 500;

type CallAudioState = {
  /** people whose microphone is off */
  muted: ReadonlySet<string>;
  /** you have the headphones off (#160); Matrix does not carry that for the others */
  deafened: boolean;
};

const NO_ONE: CallAudioState = { muted: new Set(), deafened: false };

/**
 * Who is muted in the call of `roomId`, read from the call you are in (Matrix does not carry the
 * mute state of the others), and whether you are deafened. Empty when you are not in that call.
 */
function useCallAudioState(roomId: string): CallAudioState {
  const mx = useMatrixClient();
  const userId = mx.getUserId() ?? undefined;
  const callEmbed = useAtomValue(callEmbedAtom);
  const [state, setState] = useState<CallAudioState>(NO_ONE);

  useEffect(() => {
    if (!callEmbed || callEmbed.roomId !== roomId) {
      setState((prev) => (prev === NO_ONE ? prev : NO_ONE));
      return undefined;
    }
    const update = () => {
      let next: Set<string>;
      try {
        // the same reading as the call stage and status bar (#107): you from the call control,
        // the others from LiveKit
        const local = userId ? { userId, microphone: callEmbed.control.microphone } : undefined;
        const model = readCallStage(callEmbed.document, local);
        next = new Set(model.people.filter((p) => p.muted).map((p) => p.userId));
      } catch {
        next = new Set(); // torn-down or not yet loaded iframe
      }
      const deafened = !callEmbed.control.sound;
      setState((prev) =>
        prev.deafened === deafened &&
        prev.muted.size === next.size &&
        [...next].every((id) => prev.muted.has(id))
          ? prev
          : { muted: next, deafened }
      );
    };
    update();
    const timer = window.setInterval(update, MUTE_POLL_MS);
    callEmbed.control.on(CallControlEvent.StateUpdate, update);
    return () => {
      window.clearInterval(timer);
      callEmbed.control.off(CallControlEvent.StateUpdate, update);
    };
  }, [callEmbed, roomId, userId]);

  return state;
}

/**
 * Who is in the call, one person per row right under the call room in the room list (like the
 * voice channels in Discord). Click opens the profile, right-click the person menu.
 */
export function CallMemberList({ room, members }: CallMemberListProps) {
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
    <div className={css.CallMemberList} role="group" aria-label="In the call">
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
                    aria-label="Muted"
                  />
                )}
                {deafened && userId === myId && (
                  <Icon
                    className={css.CallMemberRowMuted}
                    src={Icons.HeadphoneMute}
                    size="100"
                    filled
                    aria-label="Headphones off"
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
