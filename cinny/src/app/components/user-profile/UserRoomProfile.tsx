import { Box, Button, config, Icon, Icons, Text } from 'folds';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { UserHero, UserHeroName } from './UserHero';
import { safeColor } from '../../plugins/diddy/sanitize';
import * as css from './styles.css';
import { useDiddyProfile } from '../../plugins/diddy/profiles';
import { AwardBadgeButton } from '../diddy/AwardBadgeMenu';
import { getMxIdServer, mxcUrlToHttp } from '../../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { useUserPresence } from '../../hooks/useUserPresence';
import { IgnoredUserAlert, MutualRoomsChip, OptionsChip, ServerChip, ShareChip } from './UserChips';
import { useCloseUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { PowerChip } from './PowerChip';
import { UserInviteAlert, UserBanAlert, UserModeration, UserKickAlert } from './UserModeration';
import { useIgnoredUsers } from '../../hooks/useIgnoredUsers';
import { useMembership } from '../../hooks/useMembership';
import { Membership } from '../../../types/matrix/room';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMemberPowerCompare } from '../../hooks/useMemberPowerCompare';
import { CreatorChip } from './CreatorChip';
import { getDirectCreatePath, withSearchParam } from '../../pages/pathUtils';
import { DirectCreateSearchParams } from '../../pages/paths';
import { ProfileModules } from './ProfileModules';
import { visibleModules } from '../../plugins/diddy/profileExtras';

/** Black or white, whichever is readable on the given hex background. */
const readableTextOn = (hex: string): string => {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#FFFFFF';
};

type UserRoomProfileProps = {
  userId: string;
};
export function UserRoomProfile({ userId }: UserRoomProfileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const navigate = useNavigate();
  const closeUserRoomProfile = useCloseUserRoomProfile();
  const ignoredUsers = useIgnoredUsers();
  const ignored = ignoredUsers.includes(userId);

  const room = useRoom();
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const { hasMorePower } = useMemberPowerCompare(creators, powerLevels);

  const myUserId = mx.getSafeUserId();
  const creator = creators.has(userId);

  const canKickUser = permissions.action('kick', myUserId) && hasMorePower(myUserId, userId);
  const canBanUser = permissions.action('ban', myUserId) && hasMorePower(myUserId, userId);
  const canUnban = permissions.action('ban', myUserId);
  const canInvite = permissions.action('invite', myUserId);

  const member = room.getMember(userId);
  const membership = useMembership(room, userId);

  const server = getMxIdServer(userId);
  const displayName = getMemberDisplayName(room, userId);
  const avatarMxc = getMemberAvatarMxc(room, userId);
  const avatarUrl = (avatarMxc && mxcUrlToHttp(mx, avatarMxc, useAuthentication)) ?? undefined;

  const presence = useUserPresence(userId);

  const profile = useDiddyProfile(mx, userId);
  const accent = safeColor(profile?.card?.accent);
  const accentText = accent ? readableTextOn(accent) : undefined;
  const layout = profile?.cardLayout?.layout ?? 'standard';
  const compact = layout === 'compact';
  const modules = visibleModules(profile?.cardLayout);

  const handleMessage = () => {
    closeUserRoomProfile();
    const directSearchParam: DirectCreateSearchParams = {
      userId,
    };
    navigate(withSearchParam(getDirectCreatePath(), directSearchParam));
  };

  return (
    <Box direction="Column" className={css.CardRoot}>
      {accent && (
        <div
          className={css.CardRing}
          style={{ boxShadow: `inset 0 0 0 2px ${accent}, inset 0 0 16px color-mix(in srgb, ${accent} 33%, transparent)` }}
        />
      )}
      <UserHero
        userId={userId}
        avatarUrl={avatarUrl}
        presence={presence && presence.lastActiveTs !== 0 ? presence : undefined}
        profile={profile}
        compact={compact}
      />
      <Box direction="Column" gap="500" style={{ padding: config.space.S400 }}>
        <Box direction="Column" gap="400">
          <Box gap="400" alignItems="Start">
            <UserHeroName
              displayName={displayName}
              userId={userId}
              profile={profile}
              showBio={false}
            />
            {userId !== myUserId && (
              <Box shrink="No">
                <Button
                  size="300"
                  variant="Primary"
                  fill="Solid"
                  radii="300"
                  before={<Icon size="50" src={Icons.Message} filled />}
                  onClick={handleMessage}
                  style={
                    accent ? { backgroundColor: accent, color: accentText, borderColor: accent } : undefined
                  }
                >
                  <Text size="B300">Message</Text>
                </Button>
              </Box>
            )}
          </Box>
          <Box alignItems="Center" gap="200" wrap="Wrap">
            {!compact && server && <ServerChip server={server} />}
            <ShareChip userId={userId} />
            {!compact && (creator ? <CreatorChip /> : <PowerChip userId={userId} />)}
            {layout !== 'tabs' && modules.includes('sharedRooms') && userId !== myUserId && (
              <MutualRoomsChip userId={userId} />
            )}
            {userId !== myUserId && <OptionsChip userId={userId} />}
            {userId !== myUserId && <AwardBadgeButton userId={userId} />}
          </Box>
          <ProfileModules
            profile={profile}
            accent={accent}
            sharedRooms={
              layout === 'tabs' && userId !== myUserId ? <MutualRoomsChip userId={userId} /> : undefined
            }
          />
        </Box>
        {ignored && <IgnoredUserAlert />}
        {member && membership === Membership.Ban && (
          <UserBanAlert
            userId={userId}
            reason={member.events.member?.getContent().reason}
            canUnban={canUnban}
            bannedBy={member.events.member?.getSender()}
            ts={member.events.member?.getTs()}
          />
        )}
        {member &&
          membership === Membership.Leave &&
          member.events.member &&
          member.events.member.getSender() !== userId && (
            <UserKickAlert
              reason={member.events.member?.getContent().reason}
              kickedBy={member.events.member?.getSender()}
              ts={member.events.member?.getTs()}
            />
          )}
        {member && membership === Membership.Invite && (
          <UserInviteAlert
            userId={userId}
            reason={member.events.member?.getContent().reason}
            canKick={canKickUser}
            invitedBy={member.events.member?.getSender()}
            ts={member.events.member?.getTs()}
          />
        )}
        <UserModeration
          userId={userId}
          canInvite={canInvite && membership === Membership.Leave}
          canKick={canKickUser && membership === Membership.Join}
          canBan={canBanUser && membership !== Membership.Ban}
        />
      </Box>
    </Box>
  );
}
