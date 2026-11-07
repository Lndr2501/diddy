import React, { ChangeEventHandler, KeyboardEventHandler, useMemo, useState } from 'react';
import {
  Avatar,
  Icon,
  IconButton,
  Icons,
  IconSrc,
  Input,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Scroll,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import classNames from 'classnames';
import { isKeyHotkey } from 'is-hotkey';
import { AppearanceSettings, General } from './general';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { Account } from './account';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { UserAvatar } from '../../components/user-avatar';
import { nameInitials } from '../../utils/common';
import { Notifications } from './notifications';
import { Devices } from './devices';
import { EmojisStickers } from './emojis-stickers';
import { DeveloperTools } from './developer-tools';
import { About } from './about';
import { DiddyProfileSettings } from './diddy/DiddyProfileSettings';
import { Plugins } from './plugins';
import { stopPropagation } from '../../utils/keyboard';
import { LogoutDialog } from '../../components/LogoutDialog';
import * as css from './styles.css';

export enum SettingsPages {
  GeneralPage,
  AppearancePage,
  ProfilePage,
  AccountPage,
  NotificationPage,
  DevicesPage,
  EmojisStickersPage,
  DeveloperToolsPage,
  AboutPage,
  PluginsPage,
}

type SettingsMenuItem = {
  page: SettingsPages;
  name: string;
  icon: IconSrc;
  tone: NonNullable<css.IconTileVariants>['tone'];
  /** extra words the sidebar search matches */
  keywords: string;
};

// Groups of the sidebar, separated by a gap like in macOS System Settings.
const SETTINGS_MENU: SettingsMenuItem[][] = [
  [
    {
      page: SettingsPages.GeneralPage,
      name: 'General',
      icon: Icons.Setting,
      tone: 'Gray',
      keywords: 'language editor messages media links privacy',
    },
    {
      page: SettingsPages.AppearancePage,
      name: 'Appearance',
      icon: Icons.Sun,
      tone: 'Blue',
      keywords: 'theme dark light colour color font app icon',
    },
  ],
  [
    {
      page: SettingsPages.ProfilePage,
      name: 'Profile',
      icon: Icons.User,
      tone: 'Green',
      keywords: 'avatar name banner badge card status',
    },
    {
      page: SettingsPages.AccountPage,
      name: 'Account',
      icon: Icons.ShieldUser,
      tone: 'SoftBlue',
      keywords: 'matrix id email password contact ignored users',
    },
    {
      page: SettingsPages.NotificationPage,
      name: 'Notifications',
      icon: Icons.Bell,
      tone: 'Red',
      keywords: 'sound mention keyword push alert',
    },
    {
      page: SettingsPages.DevicesPage,
      name: 'Devices',
      icon: Icons.Monitor,
      tone: 'Gray',
      keywords: 'sessions verification encryption backup keys security',
    },
    {
      page: SettingsPages.EmojisStickersPage,
      name: 'Emojis & Stickers',
      icon: Icons.Smile,
      tone: 'Orange',
      keywords: 'emoji sticker pack image',
    },
  ],
  [
    {
      page: SettingsPages.PluginsPage,
      name: 'Plugins',
      icon: Icons.Category,
      tone: 'Green',
      keywords: 'plugin widget extension add-on addon weather web page',
    },
  ],
  [
    {
      page: SettingsPages.DeveloperToolsPage,
      name: 'Developer Tools',
      icon: Icons.Terminal,
      tone: 'Dark',
      keywords: 'debug account data developer',
    },
    {
      page: SettingsPages.AboutPage,
      name: 'About',
      icon: Icons.Info,
      tone: 'Blue',
      keywords: 'version cache reload credits source',
    },
  ],
];

const matchesQuery = (item: SettingsMenuItem, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${item.name} ${item.keywords}`.toLowerCase().includes(q);
};

type IconTileProps = {
  icon: IconSrc;
  tone: SettingsMenuItem['tone'];
  filled?: boolean;
};
function IconTile({ icon, tone, filled }: IconTileProps) {
  return (
    <span className={css.IconTile({ tone })} aria-hidden>
      <Icon src={icon} size="50" filled={filled} />
    </span>
  );
}

function LogoutRow() {
  const [logout, setLogout] = useState(false);

  return (
    <>
      <button
        type="button"
        className={classNames(css.NavRow, css.NavRowCritical)}
        onClick={() => setLogout(true)}
      >
        <IconTile icon={Icons.Power} tone="SoftRed" />
        <Text as="span" size="T300" truncate>
          Logout
        </Text>
      </button>
      {logout && (
        <Overlay open backdrop={<OverlayBackdrop />}>
          <OverlayCenter>
            <FocusTrap
              focusTrapOptions={{
                onDeactivate: () => setLogout(false),
                clickOutsideDeactivates: true,
                escapeDeactivates: stopPropagation,
              }}
            >
              <LogoutDialog handleClose={() => setLogout(false)} />
            </FocusTrap>
          </OverlayCenter>
        </Overlay>
      )}
    </>
  );
}

type SettingsProps = {
  initialPage?: SettingsPages;
  requestClose: () => void;
};
export function Settings({ initialPage, requestClose }: SettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const [activePage, setActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage !== undefined) return initialPage;
    return isMobile ? undefined : SettingsPages.GeneralPage;
  });
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () =>
      SETTINGS_MENU.map((group) => group.filter((item) => matchesQuery(item, query))).filter(
        (group) => group.length > 0
      ),
    [query]
  );

  const handlePageRequestClose = () => {
    if (isMobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  const handleSearchChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setQuery(evt.currentTarget.value);
  };

  const handleSearchKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (isKeyHotkey('enter', evt)) {
      const first = groups[0]?.[0];
      if (first) setActivePage(first.page);
      return;
    }
    if (isKeyHotkey('escape', evt)) {
      // first Esc clears the search, the next one leaves the field (and then closes the sheet)
      if (query) {
        setQuery('');
        return;
      }
      const dialog = evt.currentTarget.closest<HTMLElement>('[role=dialog]');
      if (dialog) dialog.focus();
      else evt.currentTarget.blur();
    }
  };

  const showSidebar = !isMobile || activePage === undefined;
  const showContent = activePage !== undefined;

  return (
    <div className={css.SettingsRoot}>
      {showSidebar && (
        <nav className={css.Sidebar} data-compact={isMobile} aria-label="Settings">
          <div className={css.SidebarTop}>
            {isMobile && (
              <div className={css.SidebarTopBar}>
                <Text size="H3" truncate>
                  Settings
                </Text>
                <IconButton
                  onClick={requestClose}
                  variant="Background"
                  radii="Pill"
                  aria-label="Close settings"
                >
                  <Icon src={Icons.Cross} />
                </IconButton>
              </div>
            )}
            <button
              type="button"
              className={css.ProfileCard}
              onClick={() => setActivePage(SettingsPages.ProfilePage)}
              title="Edit profile"
            >
              <Avatar size="400" radii="Pill">
                <UserAvatar surface="account"
                  userId={userId}
                  src={avatarUrl}
                  renderFallback={() => <Text size="H5">{nameInitials(displayName)}</Text>}
                />
              </Avatar>
              <span className={css.ProfileText}>
                <Text as="span" size="T400" style={{ fontWeight: 600 }} truncate>
                  {displayName}
                </Text>
                <Text as="span" size="T200" className={css.ProfileSub} truncate>
                  {userId}
                </Text>
              </span>
            </button>
            <Input
              value={query}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              before={<Icon size="50" src={Icons.Search} />}
              after={
                query ? (
                  <IconButton
                    size="300"
                    radii="Pill"
                    variant="Surface"
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    <Icon size="50" src={Icons.Cross} />
                  </IconButton>
                ) : undefined
              }
              placeholder="Search"
              aria-label="Search settings"
              size="300"
              radii="300"
              variant="Surface"
            />
          </div>
          <div className={css.SidebarScroll}>
            <Scroll variant="Background" direction="Vertical" size="300" hideTrack visibility="Hover">
              <div className={css.SidebarList}>
                {groups.length === 0 && (
                  <Text className={css.SidebarEmpty} size="T300" priority="300">
                    No results for “{query.trim()}”
                  </Text>
                )}
                {groups.map((group) => (
                  <div key={group[0].name} className={css.SidebarGroup}>
                    {group.map((item) => {
                      const active = activePage === item.page;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          className={css.NavRow}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setActivePage(item.page)}
                        >
                          <IconTile icon={item.icon} tone={item.tone} filled />
                          <Text
                            as="span"
                            size="T300"
                            style={{ fontWeight: active ? 600 : 500 }}
                            truncate
                          >
                            {item.name}
                          </Text>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Scroll>
          </div>
          <div className={css.SidebarFooter}>
            <LogoutRow />
          </div>
        </nav>
      )}
      {showContent && (
        <div className={classNames(css.Content, isMobile && css.ContentCompact)}>
          {activePage === SettingsPages.GeneralPage && (
            <General requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.AppearancePage && (
            <AppearanceSettings requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.ProfilePage && (
            <DiddyProfileSettings requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.AccountPage && (
            <Account requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.NotificationPage && (
            <Notifications requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.DevicesPage && (
            <Devices requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.EmojisStickersPage && (
            <EmojisStickers requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.PluginsPage && (
            <Plugins requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.DeveloperToolsPage && (
            <DeveloperTools requestClose={handlePageRequestClose} />
          )}
          {activePage === SettingsPages.AboutPage && (
            <About requestClose={handlePageRequestClose} />
          )}
        </div>
      )}
    </div>
  );
}
