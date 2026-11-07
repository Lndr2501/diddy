import React, { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Avatar, Box, Icons, Text } from 'folds';
import { JoinRule } from 'matrix-js-sdk';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { SettingsLayout, SettingsNavItem } from '../common-settings/SettingsLayout';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoomAvatar, useRoomJoinRule, useRoomName } from '../../hooks/useRoomMeta';
import { mDirectAtom } from '../../state/mDirectList';
import { RoomAvatar, RoomIcon } from '../../components/room-avatar';
import { SpaceSettingsPage } from '../../state/spaceSettings';
import { useRoom } from '../../hooks/useRoom';
import { EmojisStickers } from '../common-settings/emojis-stickers';
import { Members } from '../common-settings/members';
import { DeveloperTools } from '../common-settings/developer-tools';
import { General } from './general';
import { Permissions } from './permissions';

type SpaceSettingsMenuItem = SettingsNavItem<SpaceSettingsPage>;

const useSpaceSettingsMenuItems = (): SpaceSettingsMenuItem[] =>
  useMemo(
    () => [
      {
        page: SpaceSettingsPage.GeneralPage,
        name: 'General',
        icon: Icons.Setting,
        tone: 'Gray',
      },
      {
        page: SpaceSettingsPage.MembersPage,
        name: 'Members',
        icon: Icons.User,
        tone: 'Green',
      },
      {
        page: SpaceSettingsPage.PermissionsPage,
        name: 'Permissions',
        icon: Icons.Lock,
        tone: 'SoftBlue',
      },
      {
        page: SpaceSettingsPage.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: Icons.Smile,
        tone: 'Orange',
      },
      {
        page: SpaceSettingsPage.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: Icons.Terminal,
        tone: 'Dark',
      },
    ],
    []
  );

type SpaceSettingsProps = {
  initialPage?: SpaceSettingsPage;
  requestClose: () => void;
};
export function SpaceSettings({ initialPage, requestClose }: SpaceSettingsProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const mDirects = useAtomValue(mDirectAtom);

  const roomAvatar = useRoomAvatar(room, mDirects.has(room.roomId));
  const roomName = useRoomName(room);
  const joinRuleContent = useRoomJoinRule(room);

  const avatarUrl = roomAvatar
    ? mxcUrlToHttp(mx, roomAvatar, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const screenSize = useScreenSizeContext();
  const [activePage, setActivePage] = useState<SpaceSettingsPage | undefined>(() => {
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : SpaceSettingsPage.GeneralPage;
  });
  const menuItems = useSpaceSettingsMenuItems();

  const handlePageRequestClose = () => {
    if (screenSize === ScreenSize.Mobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  return (
    <SettingsLayout
      label="Space settings"
      items={menuItems}
      activePage={activePage}
      onSelect={setActivePage}
      compact={screenSize === ScreenSize.Mobile}
      requestClose={requestClose}
      header={
        <Box grow="Yes" alignItems="Center" gap="300" style={{ minWidth: 0 }}>
          <Avatar size="300" radii="400">
            <RoomAvatar
              roomId={room.roomId}
              src={avatarUrl}
              alt={roomName}
              renderFallback={() => (
                <RoomIcon
                  roomType={room.getType()}
                  size="50"
                  joinRule={joinRuleContent?.join_rule ?? JoinRule.Invite}
                  filled
                />
              )}
            />
          </Avatar>
          <Text size="T400" style={{ fontWeight: 600 }} truncate>
            {roomName}
          </Text>
        </Box>
      }
    >
      {activePage === SpaceSettingsPage.GeneralPage && (
        <General requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.MembersPage && (
        <Members requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.PermissionsPage && (
        <Permissions requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.EmojisStickersPage && (
        <EmojisStickers requestClose={handlePageRequestClose} />
      )}
      {activePage === SpaceSettingsPage.DeveloperToolsPage && (
        <DeveloperTools requestClose={handlePageRequestClose} />
      )}
    </SettingsLayout>
  );
}
