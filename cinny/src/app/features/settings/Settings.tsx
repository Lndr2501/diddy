import React, {
  ChangeEventHandler,
  KeyboardEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Icon,
  IconButton,
  Icons,
  IconSrc,
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
import { SettingsBreadcrumb } from './inset-list';

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
  /** extra words the sidebar search matches */
  keywords: string;
};

type SettingsMenuGroup = {
  /** small grey heading above the group; none for the first and the last group */
  label?: string;
  items: SettingsMenuItem[];
};

// Groups of the sidebar: plain rows with outline icons under small headings.
const SETTINGS_MENU: SettingsMenuGroup[] = [
  {
    items: [
      {
        page: SettingsPages.GeneralPage,
        name: 'General',
        icon: Icons.Setting,
        keywords: 'language editor messages media links privacy sound voice call',
      },
      {
        page: SettingsPages.AppearancePage,
        name: 'Appearance',
        icon: Icons.Sun,
        keywords: 'theme dark light colour color font app icon',
      },
      {
        page: SettingsPages.NotificationPage,
        name: 'Notifications',
        icon: Icons.Bell,
        keywords: 'sound mention keyword push alert',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        page: SettingsPages.ProfilePage,
        name: 'Profile',
        icon: Icons.User,
        keywords: 'avatar name banner badge card status',
      },
      {
        page: SettingsPages.AccountPage,
        name: 'Account',
        icon: Icons.ShieldUser,
        keywords: 'matrix id email password contact ignored users',
      },
      {
        page: SettingsPages.DevicesPage,
        name: 'Devices',
        icon: Icons.Monitor,
        keywords: 'sessions verification encryption backup keys security',
      },
    ],
  },
  {
    label: 'Extras',
    items: [
      {
        page: SettingsPages.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: Icons.Smile,
        keywords: 'emoji sticker pack image',
      },
      {
        page: SettingsPages.PluginsPage,
        name: 'Plugins',
        icon: Icons.Category,
        keywords: 'plugin widget extension add-on addon weather web page',
      },
    ],
  },
  {
    items: [
      {
        page: SettingsPages.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: Icons.Terminal,
        keywords: 'debug account data developer',
      },
      {
        page: SettingsPages.AboutPage,
        name: 'About',
        icon: Icons.Info,
        keywords: 'version cache reload credits source',
      },
    ],
  },
];

const matchesQuery = (item: SettingsMenuItem, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${item.name} ${item.keywords}`.toLowerCase().includes(q);
};

function LogoutRow() {
  const [logout, setLogout] = useState(false);

  return (
    <>
      <button
        type="button"
        className={classNames(css.NavRow, css.NavRowCritical)}
        onClick={() => setLogout(true)}
      >
        <Icon className={css.NavIcon} size="100" src={Icons.Power} />
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
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const [activePage, setActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage !== undefined) return initialPage;
    return isMobile ? undefined : SettingsPages.GeneralPage;
  });
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () =>
      SETTINGS_MENU.map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesQuery(item, query)),
      })).filter((group) => group.items.length > 0),
    [query]
  );

  // "/" jumps to the search field, like in T3 Code and many web apps
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== '/' || evt.ctrlKey || evt.metaKey || evt.altKey) return;
      const target = evt.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!searchRef.current) return;
      evt.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      const first = groups[0]?.items[0];
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
            <div className={css.SearchField}>
              <Icon size="100" src={Icons.Search} className={css.NavIcon} />
              <input
                ref={searchRef}
                className={css.SearchInput}
                value={query}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search"
                aria-label="Search settings"
                aria-keyshortcuts="/"
              />
              {query ? (
                <IconButton
                  size="300"
                  radii="300"
                  variant="Background"
                  fill="None"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                >
                  <Icon size="50" src={Icons.Cross} />
                </IconButton>
              ) : (
                <kbd className={css.SearchKey}>/</kbd>
              )}
            </div>
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
                  <div key={group.items[0].name} className={css.SidebarGroup}>
                    {group.label && (
                      <Text as="span" size="T200" className={css.SidebarGroupLabel}>
                        {group.label}
                      </Text>
                    )}
                    {group.items.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        className={css.NavRow}
                        aria-current={activePage === item.page ? 'page' : undefined}
                        onClick={() => setActivePage(item.page)}
                      >
                        <Icon className={css.NavIcon} size="100" src={item.icon} />
                        <Text as="span" size="T300" truncate>
                          {item.name}
                        </Text>
                      </button>
                    ))}
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
        <SettingsBreadcrumb.Provider value="Settings">
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
        </SettingsBreadcrumb.Provider>
      )}
    </div>
  );
}
