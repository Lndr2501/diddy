import React, { ReactNode } from 'react';
import classNames from 'classnames';
import { Icon, IconButton, Icons, IconSrc, Scroll, Text } from 'folds';
import * as settingsCss from '../settings/styles.css';

/*
 * Room and space settings in the same frame as the app settings (macOS System Settings, #21):
 * a sidebar with coloured icon tiles on the left, the selected page with a large title on the
 * right. Only the layout lives here, the pages stay the same.
 */

export type SettingsNavTone = NonNullable<settingsCss.IconTileVariants>['tone'];

export type SettingsNavItem<T> = {
  page: T;
  name: string;
  icon: IconSrc;
  tone: SettingsNavTone;
};

type SettingsLayoutProps<T> = {
  /** Avatar and name shown at the top of the sidebar. */
  header: ReactNode;
  label: string;
  items: SettingsNavItem<T>[];
  activePage: T | undefined;
  onSelect: (page: T) => void;
  compact: boolean;
  requestClose: () => void;
  children: ReactNode;
};
export function SettingsLayout<T>({
  header,
  label,
  items,
  activePage,
  onSelect,
  compact,
  requestClose,
  children,
}: SettingsLayoutProps<T>) {
  const showSidebar = !compact || activePage === undefined;
  const showContent = activePage !== undefined;

  return (
    <div className={settingsCss.SettingsRoot}>
      {showSidebar && (
        <nav className={settingsCss.Sidebar} data-compact={compact} aria-label={label}>
          <div className={settingsCss.SidebarTop}>
            <div className={settingsCss.SidebarTopBar}>
              {header}
              {compact && (
                <IconButton
                  onClick={requestClose}
                  variant="Background"
                  radii="Pill"
                  aria-label="Close settings"
                >
                  <Icon src={Icons.Cross} />
                </IconButton>
              )}
            </div>
          </div>
          <div className={settingsCss.SidebarScroll}>
            <Scroll
              variant="Background"
              direction="Vertical"
              size="300"
              hideTrack
              visibility="Hover"
            >
              <div className={settingsCss.SidebarList}>
                <div className={settingsCss.SidebarGroup}>
                  {items.map((item) => {
                    const active = activePage === item.page;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        className={settingsCss.NavRow}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onSelect(item.page)}
                      >
                        <span className={settingsCss.IconTile({ tone: item.tone })} aria-hidden>
                          <Icon src={item.icon} size="50" filled />
                        </span>
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
              </div>
            </Scroll>
          </div>
        </nav>
      )}
      {showContent && (
        <div className={classNames(settingsCss.Content, compact && settingsCss.ContentCompact)}>
          {children}
        </div>
      )}
    </div>
  );
}
