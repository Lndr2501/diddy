import React, { MouseEventHandler, useState } from 'react';
import { Avatar, Box, Menu, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { SidebarItem, SidebarItemTooltip, SidebarAvatar } from '../../../components/sidebar';
import { UserAvatar } from '../../../components/user-avatar';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { Settings } from '../../../features/settings';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { SettingsSheet } from '../../../components/SettingsSheet';
import { stopPropagation } from '../../../utils/keyboard';
import { ConnectionsMenu } from '../../../components/connection-recovery/AccountSwitcher';
import { ConnectionOverview } from '../../../components/connection-recovery/ConnectionRecovery';
import { getConnectionProfile, visibleHomeserver } from '../../../plugins/connections';
import { openIntro } from '../../../plugins/diddy/intro';

export function SettingsTab() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);

  const [settings, setSettings] = useState(false);
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [manage, setManage] = useState(false);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const toggleMenu: MouseEventHandler<HTMLButtonElement> = (evt) =>
    setMenuCords(menuCords ? undefined : evt.currentTarget.getBoundingClientRect());
  const closeMenu = () => setMenuCords(undefined);
  const closeSettings = () => setSettings(false);
  const connection = getConnectionProfile();
  const serverLabel = connection
    ? visibleHomeserver(connection.server).replace(/^https?:\/\//, '')
    : mx.getDomain() ?? '';

  const avatar = (
    <UserAvatar surface="account"
      userId={userId}
      src={avatarUrl}
      renderFallback={() => <Text size="H4">{nameInitials(displayName)}</Text>}
    />
  );

  return (
    <SidebarItem active={settings || !!menuCords}>
      <SidebarItemTooltip tooltip="Account">
        {(triggerRef) => (
          <PopOut
            anchor={menuCords}
            position="Right"
            align="End"
            content={
              <FocusTrap
                focusTrapOptions={{
                  returnFocusOnDeactivate: false,
                  initialFocus: false,
                  onDeactivate: closeMenu,
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Menu>
                  <ConnectionsMenu
                    account={
                      <Box alignItems="Center" gap="300" style={{ padding: 4 }}>
                        <Avatar size="400" radii="Pill" style={{ flexShrink: 0 }}>
                          {avatar}
                        </Avatar>
                        <Box direction="Column" style={{ minWidth: 0 }}>
                          <Text size="H6" truncate>
                            {displayName}
                          </Text>
                          <Text size="T200" priority="300" truncate>
                            {userId}
                            {serverLabel ? ` · ${serverLabel}` : ''}
                          </Text>
                        </Box>
                      </Box>
                    }
                    onSettings={() => {
                      closeMenu();
                      setSettings(true);
                    }}
                    onIntro={() => {
                      closeMenu();
                      openIntro();
                    }}
                    onManage={() => {
                      closeMenu();
                      setManage(true);
                    }}
                    onDone={closeMenu}
                  />
                </Menu>
              </FocusTrap>
            }
          >
            <SidebarAvatar as="button" ref={triggerRef} onClick={toggleMenu}>
              {avatar}
            </SidebarAvatar>
          </PopOut>
        )}
      </SidebarItemTooltip>
      {settings && (
        <SettingsSheet requestClose={closeSettings}>
          <Settings requestClose={closeSettings} />
        </SettingsSheet>
      )}
      <ConnectionOverview open={manage} onClose={() => setManage(false)} />
    </SidebarItem>
  );
}
