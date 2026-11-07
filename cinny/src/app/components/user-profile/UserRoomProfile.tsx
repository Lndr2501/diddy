import { Box, Button, Icon, Icons, Text } from 'folds';
import React from 'react';
import classNames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { ProfileStatus, UserHero, UserHeroName } from './UserHero';
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
import { ProfileModules, readableTextOn } from './ProfileModules';
import { DarkTheme, LightTheme } from '../../hooks/useTheme';
import { visibleModules } from '../../plugins/diddy/profileExtras';

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
  const shownPresence = presence && presence.lastActiveTs !== 0 ? presence : undefined;

  const profile = useDiddyProfile(mx, userId);
  const accent = safeColor(profile?.card?.accent);
  const accentText = accent ? readableTextOn(accent) : undefined;
  const layout = profile?.cardLayout?.layout ?? 'standard';
  const compact = layout === 'compact';
  const cardTheme = profile?.cardLayout?.theme;
  const modules = visibleModules(profile?.cardLayout);

  const handleMessage = () => {
    closeUserRoomProfile();
    const directSearchParam: DirectCreateSearchParams = {
      userId,
    };
    navigate(withSearchParam(getDirectCreatePath(), directSearchParam));
  };

  const notMe = userId !== myUserId;
  const actions = notMe ? (
    <>
      <AwardBadgeButton userId={userId} />
      <Button
        size="300"
        variant="Primary"
        fill="Solid"
        radii="Pill"
        before={<Icon size="50" src={Icons.Message} filled />}
        onClick={handleMessage}
        style={
          accent ? { backgroundColor: accent, color: accentText, borderColor: accent } : undefined
        }
      >
        <Text size="B300">Message</Text>
      </Button>
    </>
  ) : undefined;

  return (
    <div
      className={classNames(
        css.CardRoot,
        cardTheme === 'light' && LightTheme.classNames,
        cardTheme === 'dark' && DarkTheme.classNames,
        profile?.cardLayout?.glass && css.CardGlass,
        profile?.cardLayout?.calm && css.CardCalm
      )}
    >
      {accent && (
        <div
          className={css.CardRing}
          style={{
            boxShadow: `inset 0 0 0 2px ${accent}, inset 0 0 16px color-mix(in srgb, ${accent} 33%, transparent)`,
          }}
        />
      )}
      <div className={css.CardScroll}>
        <UserHero
          userId={userId}
          avatarUrl={avatarUrl}
          presence={shownPresence}
          profile={profile}
          compact={compact}
          actions={actions}
        />
        <div className={classNames(css.CardBody, compact && css.CardBodyCompact)}>
          <Box direction="Column" gap={compact ? '100' : '200'}>
            <UserHeroName
              displayName={displayName}
              userId={userId}
              profile={profile}
              showBio={false}
              compact={compact}
            />
            <ProfileStatus presence={shownPresence} profile={profile} />
          </Box>
          <ProfileModules
            profile={profile}
            accent={accent}
            sharedRooms={
              layout === 'tabs' && notMe ? <MutualRoomsChip userId={userId} /> : undefined
            }
          />
          <div className={css.MetaRow}>
            <ShareChip userId={userId} />
            {!compact && server && <ServerChip server={server} />}
            {!compact && (creator ? <CreatorChip /> : <PowerChip userId={userId} />)}
            {layout !== 'tabs' && modules.includes('sharedRooms') && notMe && (
              <MutualRoomsChip userId={userId} />
            )}
            {notMe && <OptionsChip userId={userId} />}
          </div>
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
          <div className={css.ModerationBox}>
            <UserModeration
              userId={userId}
              canInvite={canInvite && membership === Membership.Leave}
              canKick={canKickUser && membership === Membership.Join}
              canBan={canBanUser && membership !== Membership.Ban}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
