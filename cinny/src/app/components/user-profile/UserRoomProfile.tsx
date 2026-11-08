import { Box, Button, color, Icon, Icons, Spinner, Text } from 'folds';
import React, { useCallback, useState } from 'react';
import { ICreateRoomStateEvent, Preset, Visibility } from 'matrix-js-sdk';
import classNames from 'classnames';
import { useNavigate } from 'react-router-dom';
import { ProfileStatus, UserHero, UserHeroName } from './UserHero';
import { safeColor } from '../../plugins/diddy/sanitize';
import * as css from './styles.css';
import { useDiddyProfile } from '../../plugins/diddy/profiles';
import {
  addRoomIdToMDirect,
  getMxIdLocalPart,
  getMxIdServer,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { getMemberAvatarMxc, getMemberDisplayName } from '../../utils/room';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoom } from '../../hooks/useRoom';
import { usePresenceState } from '../../hooks/usePresenceState';
import { IgnoredUserAlert, MutualRoomsChip, OptionsChip, ServerChip, ShareChip } from './UserChips';
import {
  useCloseUserRoomProfile,
  useOpenLargeUserProfile,
} from '../../state/hooks/userRoomProfile';
import { PowerChip } from './PowerChip';
import { UserInviteAlert, UserBanAlert, UserKickAlert } from './UserModeration';
import { useIgnoredUsers } from '../../hooks/useIgnoredUsers';
import { useMembership } from '../../hooks/useMembership';
import { Membership } from '../../../types/matrix/room';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useMemberPowerCompare } from '../../hooks/useMemberPowerCompare';
import { CreatorChip } from './CreatorChip';
import { getDirectCreatePath, getDirectRoomPath, withSearchParam } from '../../pages/pathUtils';
import { DirectCreateSearchParams } from '../../pages/paths';
import { ProfileModules, readableTextOn } from './ProfileModules';
import { DarkTheme, LightTheme } from '../../hooks/useTheme';
import { visibleModules } from '../../plugins/diddy/profileExtras';
import { findDirectRoomId, PROFILE_CALL_PREFERENCES } from '../../plugins/directCall';
import { createRoomEncryptionState } from '../create-room';
import { useCallEmbed, useCallStart } from '../../hooks/useCallEmbed';
import { useSwitchCall } from '../call-switch/useSwitchCall';
import { useLivekitSupport } from '../../hooks/useLivekitSupport';
import { webRTCSupported } from '../../utils/rtc';
import { AccountDataEvent } from '../../../types/matrix/accountData';

type UserRoomProfileProps = {
  userId: string;
  /** the big profile window: large banner and avatar, always the roomy layout */
  large?: boolean;
};
export function UserRoomProfile({ userId, large }: UserRoomProfileProps) {
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

  // the same state the DM list, room header and member list show (#73)
  const shownPresence = usePresenceState(userId);

  const profile = useDiddyProfile(mx, userId);
  const accent = safeColor(profile?.card?.accent);
  const accentText = accent ? readableTextOn(accent) : undefined;
  const big = profile?.cardLayout?.big;
  // the big window has its own layout (expanded unless the owner chose tabs for it)
  const layout = large ? big?.layout ?? 'expanded' : profile?.cardLayout?.layout ?? 'standard';
  const compact = layout === 'compact';
  const cardTheme = profile?.cardLayout?.theme;
  const modules = visibleModules({ ...profile?.cardLayout, layout });
  const openLargeProfile = useOpenLargeUserProfile();

  const handleMessage = () => {
    closeUserRoomProfile();
    const directSearchParam: DirectCreateSearchParams = {
      userId,
    };
    navigate(withSearchParam(getDirectCreatePath(), directSearchParam));
  };

  const callEmbed = useCallEmbed();
  const startDirectCall = useCallStart(true);
  const livekitSupported = useLivekitSupport();
  const canCall = livekitSupported && webRTCSupported();
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string>();

  /** The private chat with this user: the existing one, or a new encrypted one. */
  const getOrCreateDirectRoom = useCallback(async () => {
    const existingId = findDirectRoomId(
      mx.getAccountData(AccountDataEvent.Direct as never)?.getContent(),
      userId,
      (id) => mx.getRoom(id)?.getMyMembership() === 'join'
    );
    const existing = existingId ? mx.getRoom(existingId) : null;
    if (existing) return existing;

    const initialState: ICreateRoomStateEvent[] = [createRoomEncryptionState()];
    const result = await mx.createRoom({
      is_direct: true,
      invite: [userId],
      visibility: Visibility.Private,
      preset: Preset.TrustedPrivateChat,
      initial_state: initialState,
    });
    addRoomIdToMDirect(mx, result.room_id, userId).catch((error) => console.warn(error));

    // the new room shows up with the next sync
    for (let i = 0; i < 50; i += 1) {
      const created = mx.getRoom(result.room_id);
      if (created) return created;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    }
    throw new Error('The chat was created but has not arrived yet. Try again in a moment.');
  }, [mx, userId]);

  const { requestSwitch, prompt: switchPrompt } = useSwitchCall();

  const handleCall = () => {
    setCallError(undefined);
    // already in the call with this very user: just go there
    const currentRoomId = callEmbed?.roomId;
    if (
      currentRoomId &&
      currentRoomId ===
        findDirectRoomId(
          mx.getAccountData(AccountDataEvent.Direct as never)?.getContent(),
          userId,
          (id) => mx.getRoom(id)?.getMyMembership() === 'join'
        )
    ) {
      closeUserRoomProfile();
      navigate(getDirectRoomPath(currentRoomId));
      return;
    }

    // the spinner shows from the click, or in a call from the confirmation
    if (!callEmbed) setCalling(true);
    requestSwitch({
      action: 'call',
      targetName: displayName ?? getMxIdLocalPart(userId) ?? userId,
      onConfirmed: () => setCalling(true),
      start: async () => {
        // when in a call this runs only after the old call is gone
        const directRoom = await getOrCreateDirectRoom();
        startDirectCall(directRoom, { ...PROFILE_CALL_PREFERENCES });
        closeUserRoomProfile();
        navigate(getDirectRoomPath(directRoom.roomId));
      },
      onError: (error) => setCallError(error?.message || 'Could not start the call.'),
    }).then((started) => {
      if (!started) setCalling(false);
    });
  };

  const notMe = userId !== myUserId;
  const actions = notMe ? (
    <>
      {canCall && (
        <Button
          size="300"
          variant="Secondary"
          fill="Soft"
          radii="Pill"
          onClick={handleCall}
          disabled={calling}
          before={
            calling ? (
              <Spinner size="100" variant="Secondary" />
            ) : (
              <Icon size="50" src={Icons.Phone} filled />
            )
          }
          title={callEmbed ? 'Leaves your current call' : 'Call privately'}
        >
          <Text size="B300">Call</Text>
        </Button>
      )}
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
          large={large ? { banner: big?.banner ?? 'tall', avatar: big?.avatar ?? 'large' } : undefined}
          onAvatarClick={large ? undefined : () => openLargeProfile(room.roomId, userId)}
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
            <ProfileStatus presence={shownPresence} />
          </Box>
          <ProfileModules
            profile={profile}
            accent={accent}
            layout={layout}
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
            {notMe && (
              <OptionsChip
                userId={userId}
                displayName={displayName ?? getMxIdLocalPart(userId) ?? userId}
                moderation={{
                  canInvite: canInvite && membership === Membership.Leave,
                  canKick: canKickUser && membership === Membership.Join,
                  canBan: canBanUser && membership !== Membership.Ban,
                }}
              />
            )}
            {profile?.clientVersion && (
              <Text
                as="span"
                size="T200"
                priority="300"
                className={css.ClientVersion}
                title={`Uses Diddy ${profile.clientVersion}`}
              >
                Diddy {profile.clientVersion}
              </Text>
            )}
          </div>
          {switchPrompt}
          {callError && (
            <Text size="T200" style={{ color: color.Critical.Main }}>
              {callError}
            </Text>
          )}
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
        </div>
      </div>
    </div>
  );
}
