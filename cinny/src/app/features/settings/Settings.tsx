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
import { AppearanceSettings, CallsSettings, ChatSettings } from './general';
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
import { SettingsBreadcrumb, SettingsCompact } from './inset-list';
import {
  SETTINGS_SEARCH_INDEX,
  SettingsSearchEntry,
  entryMatches,
  localizeEntry,
  matchingTitles,
} from './settingsSearch';
import { SettingsPages } from './settingsPages';
import { useTranslation } from 'react-i18next';
import { translate, translateEnglish } from '../../i18n';

type SettingsMenuItem = {
  page: SettingsPages;
  name: string;
  icon: IconSrc;
  /** what the sidebar search matches: name, keywords and the titles of the page's settings */
  search: SettingsSearchEntry;
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
        page: SettingsPages.AppearancePage,
        get name() {
          return translate('settings.page.appearance');
        },
        icon: Icons.Sun,
        search: SETTINGS_SEARCH_INDEX.appearance,
      },
      {
        page: SettingsPages.ChatPage,
        get name() {
          return translate('settings.page.chat');
        },
        icon: Icons.Message,
        search: SETTINGS_SEARCH_INDEX.chat,
      },
      {
        page: SettingsPages.NotificationPage,
        get name() {
          return translate('settings.page.notifications');
        },
        icon: Icons.Bell,
        search: SETTINGS_SEARCH_INDEX.notifications,
      },
      {
        page: SettingsPages.CallsPage,
        get name() {
          return translate('settings.page.callsAudio');
        },
        icon: Icons.Headphone,
        search: SETTINGS_SEARCH_INDEX.calls,
      },
    ],
  },
  {
    get label() {
      return translate('settings.page.account');
    },
    items: [
      {
        page: SettingsPages.ProfilePage,
        get name() {
          return translate('settings.page.profile');
        },
        icon: Icons.User,
        search: SETTINGS_SEARCH_INDEX.profile,
      },
      {
        page: SettingsPages.AccountPage,
        get name() {
          return translate('settings.page.account');
        },
        icon: Icons.ShieldUser,
        search: SETTINGS_SEARCH_INDEX.account,
      },
      {
        page: SettingsPages.DevicesPage,
        get name() {
          return translate('settings.page.devices');
        },
        icon: Icons.Monitor,
        search: SETTINGS_SEARCH_INDEX.devices,
      },
    ],
  },
  {
    get label() {
      return translate('settings.page.extras');
    },
    items: [
      {
        page: SettingsPages.EmojisStickersPage,
        get name() {
          return translate('settings.page.emojisStickers');
        },
        icon: Icons.Smile,
        search: SETTINGS_SEARCH_INDEX.emojisStickers,
      },
      {
        page: SettingsPages.PluginsPage,
        get name() {
          return translate('settings.page.plugins');
        },
        icon: Icons.Category,
        search: SETTINGS_SEARCH_INDEX.plugins,
      },
    ],
  },
  {
    items: [
      {
        page: SettingsPages.DeveloperToolsPage,
        get name() {
          return translate('settings.page.developerTools');
        },
        icon: Icons.Terminal,
        search: SETTINGS_SEARCH_INDEX.developerTools,
      },
      {
        page: SettingsPages.AboutPage,
        get name() {
          return translate('settings.page.about');
        },
        icon: Icons.Info,
        search: SETTINGS_SEARCH_INDEX.about,
      },
    ],
  },
];

// the search entry in the UI language; extra words per page come from `settings.search.<page>`
const localSearch = (item: SettingsMenuItem): SettingsSearchEntry => {
  const page = Object.keys(SETTINGS_SEARCH_INDEX).find(
    (name) => SETTINGS_SEARCH_INDEX[name] === item.search
  );
  const extra = page ? translate(`settings.search.${page}`, { defaultValue: '' }) : '';
  return localizeEntry(item.search, translateEnglish, extra);
};

const matchesQuery = (item: SettingsMenuItem, query: string): boolean =>
  entryMatches(localSearch(item), query);

function LogoutRow() {
  const { t } = useTranslation();
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
          {t('settings.page.logout')}
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
export { SettingsPages };

export function Settings({ initialPage, requestClose }: SettingsProps) {
  const { t } = useTranslation();
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const [activePage, setActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage !== undefined) return initialPage;
    return isMobile ? undefined : SettingsPages.AppearancePage;
  });
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () =>
      SETTINGS_MENU.map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesQuery(item, query)),
      })).filter((group) => group.items.length > 0),
    // t: the names and the search follow the UI language
    [query, t]
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
        <nav
          className={css.Sidebar}
          data-compact={isMobile}
          aria-label={t('settings.page.settings')}
        >
          <div className={css.SidebarTop}>
            {isMobile && (
              <div className={css.SidebarTopBar}>
                <Text size="H3" truncate>
                  {t('settings.page.settings')}
                </Text>
                <IconButton
                  onClick={requestClose}
                  variant="Background"
                  radii="Pill"
                  aria-label={t('settings.page.closeSettings')}
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
                placeholder={t('settings.page.search')}
                aria-label={t('settings.page.searchSettings')}
                aria-keyshortcuts="/"
              />
              {query ? (
                <IconButton
                  size="300"
                  radii="300"
                  variant="Background"
                  fill="None"
                  aria-label={t('settings.page.clearSearch')}
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
            <Scroll
              variant="Background"
              direction="Vertical"
              size="300"
              hideTrack
              visibility="Hover"
            >
              <div className={css.SidebarList}>
                {groups.length === 0 && (
                  <Text className={css.SidebarEmpty} size="T300" priority="300">
                    {t('settings.page.noResultsForTrim', { trim: query.trim() })}
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
                        <span className={css.NavRowText}>
                          <Text as="span" size="T300" truncate>
                            {item.name}
                          </Text>
                          {matchingTitles(localSearch(item), query).map((title) => (
                            <Text
                              key={title}
                              as="span"
                              size="T200"
                              priority="300"
                              truncate
                              className={css.NavRowHint}
                            >
                              {title}
                            </Text>
                          ))}
                        </span>
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
        <SettingsCompact.Provider value={isMobile}>
          <SettingsBreadcrumb.Provider value="Settings">
            <div className={classNames(css.Content, isMobile && css.ContentCompact)}>
              {activePage === SettingsPages.ChatPage && (
                <ChatSettings requestClose={handlePageRequestClose} />
              )}
              {activePage === SettingsPages.CallsPage && (
                <CallsSettings requestClose={handlePageRequestClose} />
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
        </SettingsCompact.Provider>
      )}
    </div>
  );
}
