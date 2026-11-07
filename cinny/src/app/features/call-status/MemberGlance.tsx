import { Box, config, Icon, Icons, Text } from 'folds';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import React from 'react';
import { Room } from 'matrix-js-sdk';
import { UserAvatar } from '../../components/user-avatar';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { StackedAvatar } from '../../components/stacked-avatar';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { getMouseEventCords } from '../../utils/dom';
import * as css from './styles.css';
import { useAgentTalking } from '../../state/agentVoice';
import { openCallUserMenu } from '../../plugins/callFrameMenu';

type GlanceAvatarProps = {
  room: Room;
  userId: string;
  speaking: boolean;
};
function GlanceAvatar({ room, userId, speaking }: GlanceAvatarProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openUserProfile = useOpenUserRoomProfile();
  const agent = useAgentTalking(userId, mx.getUserId() ?? undefined);

  const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
  const avatarMxc = getMemberAvatarMxc(room, userId);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96) ?? undefined
    : undefined;
  let outline: string | undefined;
  if (agent) outline = css.AgentAvatarOutline;
  else if (speaking) outline = css.SpeakerAvatarOutline;

  return (
    <StackedAvatar
      className={outline}
      title={agent ? `${name} (talking to agent)` : name}
      as="button"
      variant="Background"
      size="200"
      radii="Pill"
      onContextMenu={(evt: React.MouseEvent<HTMLButtonElement>) => {
        evt.preventDefault();
        openCallUserMenu(userId, evt.clientX, evt.clientY);
      }}
      onClick={(evt: React.MouseEvent<HTMLButtonElement>) =>
        openUserProfile(room.roomId, undefined, userId, getMouseEventCords(evt.nativeEvent), 'Top')
      }
    >
      <UserAvatar
        surface="call"
        userId={userId}
        src={avatarUrl}
        alt={name}
        renderFallback={() => <Icon size="50" src={Icons.User} filled />}
      />
    </StackedAvatar>
  );
}

type MemberGlanceProps = {
  room: Room;
  members: CallMembership[];
  speakers: Set<string>;
  max?: number;
};
export function MemberGlance({ room, members, speakers, max = 6 }: MemberGlanceProps) {
  const visibleMembers = members.slice(0, max);
  const remainingCount = max && members.length > max ? members.length - max : 0;

  return (
    <Box alignItems="Center">
      {visibleMembers.map((callMember) => {
        const { userId } = callMember;
        if (!userId) return null;
        return (
          <GlanceAvatar
            key={callMember.memberId}
            room={room}
            userId={userId}
            speaking={speakers.has(callMember.sender)}
          />
        );
      })}
      {remainingCount > 0 && (
        <Text size="L400" style={{ paddingLeft: config.space.S100 }}>
          +{remainingCount}
        </Text>
      )}
    </Box>
  );
}
