import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, Icons } from 'folds';
import { useAtomValue } from 'jotai';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';
import {
  SidebarAvatar,
  SidebarItem,
  SidebarItemBadge,
  SidebarItemTooltip,
} from '../../../components/sidebar';
import { allInvitesAtom } from '../../../state/room-list/inviteList';
import {
  getInboxInvitesPath,
  getInboxNotificationsPath,
  getInboxPath,
  joinPathComponent,
} from '../../pathUtils';
import { useInboxSelected } from '../../../hooks/router/useInbox';
import { UnreadBadge } from '../../../components/unread-badge';
import { ScreenSize, useScreenSizeContext } from '../../../hooks/useScreenSize';
import { useNavToActivePathAtom } from '../../../state/hooks/navToActivePath';

export function InboxTab() {
  const screenSize = useScreenSizeContext();
  const navigate = useNavigate();
  const navToActivePath = useAtomValue(useNavToActivePathAtom());
  const inboxSelected = useInboxSelected();
  const allInvites = useAtomValue(allInvitesAtom);
  const inviteCount = allInvites.length;
  // a mention anywhere shows a dot here (the bell in the room header used to show it)
  const roomToUnread = useAtomValue(roomToUnreadAtom);
  let hasMention = false;
  roomToUnread.forEach((unread) => {
    if (unread.highlight > 0) hasMention = true;
  });

  const handleInboxClick = () => {
    if (screenSize === ScreenSize.Mobile) {
      navigate(getInboxPath());
      return;
    }
    const activePath = navToActivePath.get('inbox');
    if (activePath) {
      navigate(joinPathComponent(activePath));
      return;
    }

    const path = inviteCount > 0 ? getInboxInvitesPath() : getInboxNotificationsPath();
    navigate(path);
  };

  return (
    <SidebarItem active={inboxSelected}>
      <SidebarItemTooltip tooltip="Inbox">
        {(triggerRef) => (
          <SidebarAvatar as="button" ref={triggerRef} outlined onClick={handleInboxClick}>
            <Icon src={Icons.Inbox} filled={inboxSelected} />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {inviteCount > 0 && (
        <SidebarItemBadge hasCount>
          <UnreadBadge highlight count={inviteCount} />
        </SidebarItemBadge>
      )}
      {inviteCount === 0 && hasMention && (
        <SidebarItemBadge hasCount={false}>
          <UnreadBadge highlight count={0} />
        </SidebarItemBadge>
      )}
    </SidebarItem>
  );
}
