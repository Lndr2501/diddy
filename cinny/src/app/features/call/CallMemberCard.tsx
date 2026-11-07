import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import React, { useState } from 'react';
import { Avatar, Box, Icon, Icons, Text } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { SequenceCard } from '../../components/sequence-card';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { useRoom } from '../../hooks/useRoom';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { getMouseEventCords } from '../../utils/dom';
import * as css from './styles.css';

type CallMemberCardProps = {
  member: CallMembership;
};

/** Up to two capital initials for the avatar fallback (issue #23). */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + second).toUpperCase() || '?';
}

/**
 * Compact participant strip for the joined call (issue #23): the embedded call fills the whole
 * area, so who is on the call was not visible from the Diddy window itself. Avatars when the
 * profile has one, capital initials otherwise, always with the display name.
 */
export function CallRoster({ members }: { members: CallMembership[] }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = useRoom();
  if (members.length === 0) return null;

  return (
    <Box className={css.CallRoster} alignItems="Center" gap="200" wrap="Wrap">
      <Text size="T200" priority="300">
        Im Gespräch
      </Text>
      {members.map((member) => {
        const { userId } = member;
        if (!userId) return null;
        const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
        const avatarMxc = getMemberAvatarMxc(room, userId);
        const avatarUrl = avatarMxc
          ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 64, 64) ?? undefined
          : undefined;
        return (
          <Box key={member.memberId} className={css.CallRosterChip} alignItems="Center" gap="200">
            <Avatar size="300" radii="Pill">
              <UserAvatar
                userId={userId}
                src={avatarUrl}
                alt={name}
                renderFallback={() => (
                  <Text as="span" size="T200">
                    {initialsFromName(name)}
                  </Text>
                )}
              />
            </Avatar>
            <Text size="T300" truncate>
              {name}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function CallMemberCard({ member }: CallMemberCardProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const room = useRoom();

  const openUserProfile = useOpenUserRoomProfile();

  const { userId } = member;
  if (!userId) return null;

  const name = getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;
  const avatarMxc = getMemberAvatarMxc(room, userId);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 96, 96) ?? undefined
    : undefined;

  const audioOnly = member.callIntent === 'audio';

  return (
    <SequenceCard
      as="button"
      key={member.memberId}
      className={css.CallMemberCard}
      variant="SurfaceVariant"
      radii="500"
      onClick={(evt: any) =>
        openUserProfile(
          room.roomId,
          undefined,
          userId,
          getMouseEventCords(evt.nativeEvent),
          'Right'
        )
      }
    >
      <Box grow="Yes" gap="300" alignItems="Center">
        <Avatar size="200" radii="Pill">
          <UserAvatar
            userId={userId}
            src={avatarUrl}
            alt={name}
            renderFallback={() => <Icon size="50" src={Icons.User} filled />}
          />
        </Avatar>
        <Box grow="Yes">
          <Text size="L400" truncate>
            {name}
          </Text>
        </Box>
        {audioOnly && <Icon src={Icons.VideoCameraMute} size="100" />}
      </Box>
    </SequenceCard>
  );
}

export function CallMemberRenderer({
  members,
  max = 4,
}: {
  members: CallMembership[];
  max?: number;
}) {
  const [viewMore, setViewMore] = useState(false);

  const truncatedMembers = viewMore ? members : members.slice(0, 4);
  const remaining = members.length - truncatedMembers.length;

  return (
    <>
      {truncatedMembers.map((member) => (
        <CallMemberCard key={member.memberId} member={member} />
      ))}
      {members.length > max && (
        <SequenceCard
          as="button"
          className={css.CallMemberCard}
          variant="SurfaceVariant"
          radii="500"
          onClick={() => setViewMore(!viewMore)}
        >
          <Box grow="Yes" gap="300" alignItems="Center">
            {viewMore ? (
              <Text size="L400" truncate>
                Collapse
              </Text>
            ) : (
              <Text size="L400" truncate>
                {remaining === 0 ? `+${remaining} Other` : `+${remaining} Others`}
              </Text>
            )}
          </Box>
          <Icon src={viewMore ? Icons.ChevronTop : Icons.ChevronBottom} size="100" />
        </SequenceCard>
      )}
    </>
  );
}
