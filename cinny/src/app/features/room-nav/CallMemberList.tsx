import React from 'react';
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
import * as css from './styles.css';

type CallMemberListProps = {
  room: Room;
  members: CallMembership[];
};

/**
 * Who is in the call, one person per row right under the call room in the room list (like the
 * voice channels in Discord). Click opens the profile, right-click the person menu.
 */
export function CallMemberList({ room, members }: CallMemberListProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();

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
          </button>
        );
      })}
    </div>
  );
}
