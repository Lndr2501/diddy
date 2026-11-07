import React, { useMemo, useState } from 'react';
import { Avatar, Icon, IconButton, Icons, Text, Tooltip, TooltipProvider } from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import * as css from './style.css';
import { searchModalAtom } from '../../state/searchModal';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';
import { getInboxNotificationsPath } from '../../pages/pathUtils';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useUserProfile } from '../../hooks/useUserProfile';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';
import { UserAvatar } from '../user-avatar';
import { SettingsSheet } from '../SettingsSheet';
import { Settings } from '../../features/settings';

/** Search field that opens the global search modal (same as the Mod+K shortcut). */
export function HeaderSearchField() {
  const setSearchOpen = useSetAtom(searchModalAtom);
  const hint = useMemo(
    () => (/mac|iphone|ipad/i.test(window.navigator.platform) ? '⌘K' : 'Ctrl K'),
    []
  );

  return (
    <button
      type="button"
      className={css.SearchField}
      onClick={() => setSearchOpen(true)}
      aria-label="Search"
    >
      <Icon size="100" src={Icons.Search} />
      <Text as="span" size="T300" className={css.SearchLabel} truncate>
        Search
      </Text>
      <span className={css.SearchHint}>{hint}</span>
    </button>
  );
}

/** Bell that opens the notifications inbox, with a red dot while any highlight is unread. */
export function HeaderBellButton() {
  const navigate = useNavigate();
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  const hasHighlight = useMemo(() => {
    let found = false;
    roomToUnread.forEach((unread) => {
      if (unread.highlight > 0) found = true;
    });
    return found;
  }, [roomToUnread]);

  return (
    <TooltipProvider
      position="Bottom"
      offset={4}
      tooltip={
        <Tooltip>
          <Text>Notifications</Text>
        </Tooltip>
      }
    >
      {(triggerRef) => (
        <IconButton
          ref={triggerRef}
          className={css.SoftIconButton}
          variant="Surface"
          fill="Soft"
          size="300"
          radii="300"
          onClick={() => navigate(getInboxNotificationsPath())}
          aria-label="Notifications"
        >
          <Icon size="200" src={Icons.Bell} />
          {hasHighlight && <span className={css.BellDot} />}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

/** Own profile avatar that opens the user settings (same modal as the sidebar settings tab). */
export function HeaderProfileButton() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const [settings, setSettings] = useState(false);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  return (
    <>
      <TooltipProvider
        position="Bottom"
        align="End"
        offset={4}
        tooltip={
          <Tooltip>
            <Text>User Settings</Text>
          </Tooltip>
        }
      >
        {(triggerRef) => (
          <button
            type="button"
            ref={triggerRef}
            className={css.ProfileButton}
            onClick={() => setSettings(true)}
            aria-label="User Settings"
          >
            <Avatar size="300" radii="300">
              <UserAvatar
                userId={userId}
                src={avatarUrl}
                renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
              />
            </Avatar>
          </button>
        )}
      </TooltipProvider>
      {settings && (
        <SettingsSheet requestClose={() => setSettings(false)}>
          <Settings requestClose={() => setSettings(false)} />
        </SettingsSheet>
      )}
    </>
  );
}
