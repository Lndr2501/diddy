import React from 'react';
import { Icon, Icons, Text, config } from 'folds';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { Room } from 'matrix-js-sdk';
import { UserAvatar } from '../../components/user-avatar';
import { StackedAvatar } from '../../components/stacked-avatar';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';

type CallMemberAvatarsProps = {
  room: Room;
  members: CallMembership[];
  max?: number;
};

/** Who is in the call, as profile pictures in the room's row of the room list. */
export function CallMemberAvatars({ room, members, max = 4 }: CallMemberAvatarsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const shown = members.filter((m) => !!m.userId).slice(0, max);
  const remaining = members.length - shown.length;

  return (
    <>
      {shown.map((member) => {
        const userId = member.userId as string;
        const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
        const avatarMxc = getMemberAvatarMxc(room, userId);
        const src = avatarMxc
          ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 64, 64) ?? undefined
          : undefined;
        return (
          <StackedAvatar
            key={member.memberId}
            title={name}
            variant="Background"
            size="200"
            radii="Pill"
          >
            <UserAvatar
              userId={userId}
              src={src}
              alt={name}
              renderFallback={() => <Icon size="50" src={Icons.User} filled />}
            />
          </StackedAvatar>
        );
      })}
      {remaining > 0 && (
        <Text size="L400" style={{ paddingLeft: config.space.S100 }}>
          +{remaining}
        </Text>
      )}
    </>
  );
}
