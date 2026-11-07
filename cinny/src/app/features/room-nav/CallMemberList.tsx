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
import { mutedCallUsers, openCallUserMenu } from '../../plugins/callFrameMenu';
import { callEmbedAtom } from '../../state/callEmbed';
import * as css from './styles.css';

type CallMemberListProps = {
  room: Room;
  members: CallMembership[];
};

const MUTE_POLL_MS = 500;

/**
 * Who is muted in the call of `roomId`, read from the call you are in (Matrix does not carry the
 * mute state of the others). Empty when you are not in that call.
 */
function useMutedCallUsers(roomId: string): ReadonlySet<string> {
  const callEmbed = useAtomValue(callEmbedAtom);
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!callEmbed || callEmbed.roomId !== roomId) {
      setMuted((prev) => (prev.size === 0 ? prev : new Set()));
      return undefined;
    }
    const update = () => {
      let next: Set<string>;
      try {
        next = mutedCallUsers(callEmbed.document);
      } catch {
        next = new Set(); // torn-down or not yet loaded iframe
      }
      setMuted((prev) =>
        prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next
      );
    };
    update();
    const timer = window.setInterval(update, MUTE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [callEmbed, roomId]);

  return muted;
}

/**
 * Who is in the call, one person per row right under the call room in the room list (like the
 * voice channels in Discord). Click opens the profile, right-click the person menu.
 */
export function CallMemberList({ room, members }: CallMemberListProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();
  const mutedUsers = useMutedCallUsers(room.roomId);

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
            <Avatar size="200" radii="Pill" className={css.CallMemberRowAvatar}>
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
            {mutedUsers.has(userId) && (
              <Icon
                className={css.CallMemberRowMuted}
                src={Icons.MicMute}
                size="100"
                filled
                aria-label="Muted"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
