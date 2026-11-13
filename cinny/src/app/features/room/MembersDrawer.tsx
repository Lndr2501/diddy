import React, {
  ReactNode,
  ChangeEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Avatar,
  Badge,
  Box,
  Chip,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  config,
} from 'folds';
import { MatrixClient, Room, RoomMember, UserEvent } from 'matrix-js-sdk';
import { useVirtualizer } from '@tanstack/react-virtual';
import classNames from 'classnames';

import * as css from './MembersDrawer.css';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { UseStateProvider } from '../../components/UseStateProvider';
import {
  SearchItemStrGetter,
  UseAsyncSearchOptions,
  useAsyncSearch,
} from '../../hooks/useAsyncSearch';
import { useDebounce } from '../../hooks/useDebounce';
import { TypingIndicator } from '../../components/typing-indicator';
import { getMemberDisplayName, getMemberSearchStr } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { useSetSetting, useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { millify } from '../../plugins/millify';
import { ScrollTopContainer } from '../../components/scroll-top-container';
import { UserAvatar } from '../../components/user-avatar';
import { useRoomTypingMember } from '../../hooks/useRoomTypingMembers';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useMembershipFilter, useMembershipFilterMenu } from '../../hooks/useMemberFilter';
import { useMemberPowerSort, useMemberSort, useMemberSortMenu } from '../../hooks/useMemberSort';
import { useGetMemberPowerLevel, usePowerLevelsContext } from '../../hooks/usePowerLevels';
import { MembershipFilterMenu } from '../../components/MembershipFilterMenu';
import { MemberSortMenu } from '../../components/MemberSortMenu';
import { useOpenUserRoomProfile, useUserRoomProfileState } from '../../state/hooks/userRoomProfile';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { GetMemberPowerTag, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { MemberPowerTag } from '../../../types/matrix/room';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { usePresenceState } from '../../hooks/usePresenceState';
import { isPresentState, resolvePresenceState } from '../../utils/presenceState';
import { AvatarPresence, PresenceBadge } from '../../components/presence';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { DiddyName } from '../../components/diddy/DiddyName';
import { readProfile, useDiddyProfile } from '../../plugins/diddy/profiles';
import { useMyStatus } from '../../plugins/diddy/status';
import { useRoomBots } from '../../hooks/useRoomBots';
import {
  NameplateBackdrop,
  NameplateHost,
  NameplateText,
  hasNameplate,
  nameplateSurfaceStyle,
  useNameplateAnimation,
} from '../../components/diddy/Nameplate';
import { SIDE_TONE } from '../../components/sidebar/diddyTokens';

const MEMBER_SEARCH_MIN = 20;

type MemberDrawerHeaderProps = {
  room: Room;
  /** small icon buttons (filter, sort, invite) next to the close button */
  actions?: ReactNode;
};
function MemberDrawerHeader({ room, actions }: MemberDrawerHeaderProps) {
  const setPeopleDrawer = useSetSetting(settingsAtom, 'isPeopleDrawer');

  return (
    <Header className={css.MembersDrawerHeader} variant="Surface" size="600">
      <Box grow="Yes" alignItems="Center" gap="200">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Text
            className={css.MembersDrawerTitle}
            title={`${room.getJoinedMemberCount()} Members`}
            size="H5"
            truncate
          >
            Members{' '}
            <span className={css.MembersDrawerCount}>{millify(room.getJoinedMemberCount())}</span>
          </Text>
        </Box>
        <Box shrink="No" alignItems="Center" gap="100">
          {actions}
          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Close</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                ref={triggerRef}
                variant="Surface"
                fill="None"
                radii="400"
                onClick={() => setPeopleDrawer(false)}
              >
                <Icon src={Icons.Cross} />
              </IconButton>
            )}
          </TooltipProvider>
        </Box>
      </Box>
    </Header>
  );
}

type MemberItemProps = {
  mx: MatrixClient;
  useAuthentication: boolean;
  room: Room;
  member: RoomMember;
  onClick: MouseEventHandler<HTMLButtonElement>;
  pressed?: boolean;
  typing?: boolean;
  admin?: boolean;
  /** shown in the "Offline" group: the row is greyed out */
  offline?: boolean;
  /** announced itself as a bot (dev.diddy.bot / dev.diddy.commands): "Bot" as the status line */
  bot?: boolean;
};
type MemberRowViewProps = Omit<MemberItemProps, 'room' | 'member'> & {
  userId: string;
  name: string;
  avatarMxc?: string;
};
/**
 * One member row: avatar with presence, name in the member's name style with badges, nameplate.
 * Also drawn by the profile editor's preview with the draft (#105).
 */
export function MemberRowView({
  mx,
  useAuthentication,
  userId,
  name,
  avatarMxc,
  onClick,
  pressed,
  typing,
  admin,
  offline,
  bot,
}: MemberRowViewProps) {
  const avatarUrl = avatarMxc
    ? mx.mxcUrlToHttp(avatarMxc, 100, 100, 'crop', undefined, false, useAuthentication)
    : undefined;
  const presence = usePresenceState(userId);
  const diddyProfile = useDiddyProfile(mx, userId);
  const nameplate = diddyProfile?.nameplate;
  const animateNameplate = useNameplateAnimation();
  const withNameplate = hasNameplate(nameplate);

  return (
    <MenuItem
      className={classNames(
        css.MemberRow,
        offline && css.MemberRowOffline,
        withNameplate && NameplateHost
      )}
      style={{
        padding: `0 ${config.space.S200}`,
        ...(withNameplate ? nameplateSurfaceStyle(SIDE_TONE) : {}),
      }}
      aria-pressed={pressed}
      data-user-id={userId}
      variant="Surface"
      radii="400"
      onClick={onClick}
      before={
        <AvatarPresence
          badge={
            presence &&
            isPresentState(presence.state) && (
              <PresenceBadge state={presence.state} message={presence.message} size="200" />
            )
          }
        >
          <Avatar size="200" radii="Pill">
            <UserAvatar
              surface="members"
              userId={userId}
              src={avatarUrl ?? undefined}
              alt={name}
              renderFallback={() => <Icon size="50" src={Icons.User} filled />}
            />
          </Avatar>
        </AvatarPresence>
      }
      after={
        <>
          {typing && (
            <Badge size="300" variant="Secondary" fill="Soft" radii="Pill" outlined>
              <TypingIndicator size="300" />
            </Badge>
          )}
          {admin && (
            <Icon
              className={css.AdminIcon}
              size="100"
              src={Icons.ShieldUser}
              filled
              aria-label="Admin"
            />
          )}
        </>
      }
    >
      {withNameplate && <NameplateBackdrop plate={nameplate} animate={animateNameplate} />}
      <Box
        grow="Yes"
        direction="Column"
        className={withNameplate ? NameplateText : undefined}
        style={{ minWidth: 0 }}
      >
        <Text size="T400" truncate>
          <DiddyName userId={userId} name={name} showBadges />
        </Text>
        {bot && (
          <Text size="T200" priority="300" truncate>
            Bot
          </Text>
        )}
      </Box>
    </MenuItem>
  );
}

function MemberItem({
  mx,
  useAuthentication,
  room,
  member,
  onClick,
  pressed,
  typing,
  admin,
  offline,
  bot,
}: MemberItemProps) {
  const name =
    getMemberDisplayName(room, member.userId) ?? getMxIdLocalPart(member.userId) ?? member.userId;
  return (
    <MemberRowView
      mx={mx}
      useAuthentication={useAuthentication}
      userId={member.userId}
      name={name}
      avatarMxc={member.getMxcAvatarUrl()}
      onClick={onClick}
      pressed={pressed}
      typing={typing}
      admin={admin}
      offline={offline}
      bot={bot}
    />
  );
}

const ADMIN_POWER_LEVEL = 100;

const OFFLINE_TAG: MemberPowerTag = { name: 'Offline' };
const BOTS_TAG: MemberPowerTag = { name: 'Bots' };

type MemberGroupLabel = MemberPowerTag & { count: number };

const isPresent = (mx: MatrixClient, userId: string): boolean => {
  const user = mx.getUser(userId);
  // grouping only needs connected or not, which the Matrix presence alone decides
  return isPresentState(
    resolvePresenceState(
      user
        ? {
            presence: user.presence,
            lastActiveTs: user.getLastActiveTs(),
            // invisible counts as offline for everyone, also for yourself while you sync
            chosen: readProfile(mx, userId)?.status === 'invisible' ? 'invisible' : undefined,
          }
        : undefined
    )
  );
};

/** Re-renders when anyone's presence changes, batched so busy rooms don't re-sort on every event. */
const usePresenceVersion = (mx: MatrixClient): number => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        setVersion((v) => v + 1);
      }, 300);
    };
    mx.on(UserEvent.Presence, bump);
    return () => {
      mx.removeListener(UserEvent.Presence, bump);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [mx]);
  return version;
};

/**
 * Discord-style member list: people who are online (or idle) grouped by their power tag,
 * then everyone who is offline in one shared "Offline" group at the bottom.
 * If the server sends no presence at all, the list stays grouped by power tag only.
 * Bots (dev.diddy.bot / dev.diddy.commands) get their own "Bots" group above "Offline".
 */
const groupMembersByPresence = (
  mx: MatrixClient,
  allMembers: RoomMember[],
  getTag: GetMemberPowerTag,
  bots: ReadonlyMap<string, unknown>
): { items: Array<MemberGroupLabel | RoomMember>; offline: ReadonlySet<string> } => {
  const myUserId = mx.getUserId();
  const botMembers = allMembers.filter((m) => bots.has(m.userId));
  const members = botMembers.length
    ? allMembers.filter((m) => !bots.has(m.userId))
    : allMembers;
  const hasPresence = members.some(
    (m) => m.userId !== myUserId && mx.getUser(m.userId)?.events.presence !== undefined
  );
  const present = hasPresence ? members.filter((m) => isPresent(mx, m.userId)) : members;
  const absent = hasPresence ? members.filter((m) => !isPresent(mx, m.userId)) : [];

  const items: Array<MemberGroupLabel | RoomMember> = [];
  let label: MemberGroupLabel | undefined;
  let prevTag: MemberPowerTag | undefined;
  present.forEach((member) => {
    const tag = getTag(member.userId);
    if (!label || tag !== prevTag) {
      prevTag = tag;
      label = { ...tag, count: 0 };
      items.push(label);
    }
    label.count += 1;
    items.push(member);
  });
  if (botMembers.length > 0) {
    items.push({ ...BOTS_TAG, count: botMembers.length });
    items.push(...botMembers);
  }
  if (absent.length > 0) {
    items.push({ ...OFFLINE_TAG, count: absent.length });
    items.push(...absent);
  }
  return { items, offline: new Set(absent.map((m) => m.userId)) };
};

const SEARCH_OPTIONS: UseAsyncSearchOptions = {
  limit: 1000,
  matchOptions: {
    contain: true,
  },
};

const mxIdToName = (mxId: string) => getMxIdLocalPart(mxId) ?? mxId;
const getRoomMemberStr: SearchItemStrGetter<RoomMember> = (m, query) =>
  getMemberSearchStr(m, query, mxIdToName);

type MembersDrawerProps = {
  room: Room;
  members: RoomMember[];
};
export function MembersDrawer({ room, members }: MembersDrawerProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);
  const powerLevels = usePowerLevelsContext();
  const creators = useRoomCreators(room);
  const getPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
  const getPowerLevel = useGetMemberPowerLevel(powerLevels);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canInvite = permissions.action('invite', mx.getSafeUserId());
  const [invitePrompt, setInvitePrompt] = useState(false);

  const fetchingMembers = members.length < room.getJoinedMemberCount();
  const openUserRoomProfile = useOpenUserRoomProfile();
  const space = useSpaceOptionally();
  const openProfileUserId = useUserRoomProfileState()?.userId;

  const membershipFilterMenu = useMembershipFilterMenu();
  const sortFilterMenu = useMemberSortMenu();
  const [sortFilterIndex, setSortFilterIndex] = useSetting(settingsAtom, 'memberSortFilterIndex');
  const [membershipFilterIndex, setMembershipFilterIndex] = useState(0);

  const membershipFilter = useMembershipFilter(membershipFilterIndex, membershipFilterMenu);
  const memberSort = useMemberSort(sortFilterIndex, sortFilterMenu);
  const memberPowerSort = useMemberPowerSort(creators, getPowerLevel);

  const typingMembers = useRoomTypingMember(room.roomId);

  const filteredMembers = useMemo(
    () => members.filter(membershipFilter.filterFn).sort(memberSort.sortFn).sort(memberPowerSort),
    [members, membershipFilter, memberSort, memberPowerSort]
  );

  const [result, search, resetSearch] = useAsyncSearch(
    filteredMembers,
    getRoomMemberStr,
    SEARCH_OPTIONS
  );
  if (!result && searchInputRef.current?.value) search(searchInputRef.current.value);

  const processMembers = result ? result.items : filteredMembers;
  // a name search only pays off in bigger rooms
  const showSearch = room.getJoinedMemberCount() >= MEMBER_SEARCH_MIN || !!result;

  const presenceVersion = usePresenceVersion(mx);
  const bots = useRoomBots(room);
  // going invisible must regroup you at once, without waiting for a presence event
  const myStatus = useMyStatus(mx);
  const { items: PLTagOrRoomMember, offline: offlineIds } = useMemo(
    () => groupMembersByPresence(mx, processMembers, getPowerTag, bots),
    // presenceVersion changes whenever someone goes online/offline
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, processMembers, getPowerTag, bots, presenceVersion, myStatus]
  );

  const virtualizer = useVirtualizer({
    count: PLTagOrRoomMember.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = useDebounce(
    useCallback(
      (evt) => {
        if (evt.target.value) search(evt.target.value);
        else resetSearch();
      },
      [search, resetSearch]
    ),
    { wait: 200 }
  );

  const headerActions = (
    <>
      <UseStateProvider initial={undefined}>
        {(anchor: RectCords | undefined, setAnchor) => (
          <PopOut
            anchor={anchor}
            position="Bottom"
            align="End"
            offset={4}
            content={
              <MembershipFilterMenu
                selected={membershipFilterIndex}
                onSelect={setMembershipFilterIndex}
                requestClose={() => setAnchor(undefined)}
              />
            }
          >
            <IconButton
              variant="Surface"
              fill="None"
              radii="400"
              aria-label={`Show: ${membershipFilter.name}`}
              title={`Show: ${membershipFilter.name}`}
              aria-pressed={!!anchor || membershipFilterIndex !== 0}
              onClick={
                ((evt) =>
                  setAnchor(
                    evt.currentTarget.getBoundingClientRect()
                  )) as MouseEventHandler<HTMLButtonElement>
              }
            >
              <Icon size="100" src={Icons.Filter} />
            </IconButton>
          </PopOut>
        )}
      </UseStateProvider>
      <UseStateProvider initial={undefined}>
        {(anchor: RectCords | undefined, setAnchor) => (
          <PopOut
            anchor={anchor}
            position="Bottom"
            align="End"
            offset={4}
            content={
              <MemberSortMenu
                selected={sortFilterIndex}
                onSelect={setSortFilterIndex}
                requestClose={() => setAnchor(undefined)}
              />
            }
          >
            <IconButton
              variant="Surface"
              fill="None"
              radii="400"
              aria-label={`Sort: ${memberSort.name}`}
              title={`Sort: ${memberSort.name}`}
              aria-pressed={!!anchor}
              onClick={
                ((evt) =>
                  setAnchor(
                    evt.currentTarget.getBoundingClientRect()
                  )) as MouseEventHandler<HTMLButtonElement>
              }
            >
              <Icon size="100" src={Icons.Sort} />
            </IconButton>
          </PopOut>
        )}
      </UseStateProvider>
      {canInvite && (
        <IconButton
          variant="Surface"
          fill="None"
          radii="400"
          aria-label="Invite"
          title="Invite"
          aria-pressed={invitePrompt}
          onClick={() => setInvitePrompt(true)}
        >
          <Icon size="100" src={Icons.UserPlus} />
        </IconButton>
      )}
    </>
  );

  const handleMemberClick: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const btn = evt.currentTarget as HTMLButtonElement;
    const userId = btn.getAttribute('data-user-id');
    if (!userId) return;
    openUserRoomProfile(room.roomId, space?.roomId, userId, btn.getBoundingClientRect(), 'Left');
  };

  return (
    <Box
      className={classNames(css.MembersDrawer, ContainerColor({ variant: 'Surface' }))}
      shrink="No"
      direction="Column"
    >
      {invitePrompt && <InviteUserPrompt room={room} requestClose={() => setInvitePrompt(false)} />}
      <MemberDrawerHeader room={room} actions={headerActions} />
      <Box className={css.MemberDrawerContentBase} grow="Yes">
        <Scroll ref={scrollRef} variant="Surface" size="300" visibility="Hover" hideTrack>
          <Box className={css.MemberDrawerContent} direction="Column" gap="200">
            <Box ref={scrollTopAnchorRef} className={css.DrawerGroup} direction="Column" gap="200">
              {showSearch && (
                <Box direction="Column" gap="100">
                  <Input
                    ref={searchInputRef}
                    onChange={handleSearchChange}
                    style={{ paddingRight: config.space.S200 }}
                    placeholder="Type name..."
                    variant="SurfaceVariant"
                    size="400"
                    radii="400"
                    before={<Icon size="50" src={Icons.Search} />}
                    after={
                      result && (
                        <Chip
                          variant={result.items.length > 0 ? 'Success' : 'Critical'}
                          size="400"
                          radii="Pill"
                          aria-pressed
                          onClick={() => {
                            if (searchInputRef.current) {
                              searchInputRef.current.value = '';
                              searchInputRef.current.focus();
                            }
                            resetSearch();
                          }}
                          after={<Icon size="50" src={Icons.Cross} />}
                        >
                          <Text size="B300">{`${result.items.length || 'No'} ${
                            result.items.length === 1 ? 'Result' : 'Results'
                          }`}</Text>
                        </Chip>
                      )
                    }
                  />
                </Box>
              )}
            </Box>

            <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
              <IconButton
                onClick={() => virtualizer.scrollToOffset(0)}
                variant="Surface"
                radii="Pill"
                outlined
                size="300"
                aria-label="Scroll to Top"
              >
                <Icon src={Icons.ChevronTop} size="300" />
              </IconButton>
            </ScrollTopContainer>

            {!fetchingMembers && !result && processMembers.length === 0 && (
              <Text style={{ padding: config.space.S300 }} align="Center">
                {`No "${membershipFilter.name}" Members`}
              </Text>
            )}

            <Box className={css.MembersGroup} direction="Column" gap="100">
              <div
                style={{
                  position: 'relative',
                  height: virtualizer.getTotalSize(),
                }}
              >
                {virtualizer.getVirtualItems().map((vItem) => {
                  const tagOrMember = PLTagOrRoomMember[vItem.index];
                  if (!('userId' in tagOrMember)) {
                    return (
                      <Text
                        style={{
                          transform: `translateY(${vItem.start}px)`,
                        }}
                        data-index={vItem.index}
                        ref={virtualizer.measureElement}
                        key={`${room.roomId}-${vItem.index}`}
                        className={classNames(css.MembersGroupLabel, css.DrawerVirtualItem)}
                        size="L400"
                      >
                        {`${tagOrMember.name} — ${tagOrMember.count}`}
                      </Text>
                    );
                  }

                  return (
                    <div
                      style={{
                        transform: `translateY(${vItem.start}px)`,
                      }}
                      className={css.DrawerVirtualItem}
                      data-index={vItem.index}
                      key={`${room.roomId}-${tagOrMember.userId}`}
                      ref={virtualizer.measureElement}
                    >
                      <MemberItem
                        mx={mx}
                        useAuthentication={useAuthentication}
                        room={room}
                        member={tagOrMember}
                        onClick={handleMemberClick}
                        pressed={openProfileUserId === tagOrMember.userId}
                        admin={
                          creators.has(tagOrMember.userId) ||
                          getPowerLevel(tagOrMember.userId) >= ADMIN_POWER_LEVEL
                        }
                        offline={offlineIds.has(tagOrMember.userId)}
                        bot={bots.has(tagOrMember.userId)}
                        typing={typingMembers.some(
                          (receipt) => receipt.userId === tagOrMember.userId
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            </Box>

            {fetchingMembers && (
              <Box justifyContent="Center">
                <Spinner />
              </Box>
            )}
          </Box>
        </Scroll>
      </Box>
    </Box>
  );
}
