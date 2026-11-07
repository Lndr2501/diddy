import React, { useEffect, useState } from 'react';
import { Box, config, Line, Menu, MenuItem, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtomValue } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { stopPropagation } from '../utils/keyboard';
import { copyToClipboard } from '../utils/dom';
import {
  CALL_USER_MENU_EVENT,
  CallUserMenuDetail,
  findCallTile,
  isCallFrameHidden,
  openCallTileMenu,
} from '../plugins/callFrameMenu';
import { callEmbedAtom } from '../state/callEmbed';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useOpenUserRoomProfile } from '../state/hooks/userRoomProfile';
import { getMxIdLocalPart } from '../utils/matrix';
import { getMemberDisplayName } from '../utils/room';
import { getDirectCreatePath, withSearchParam } from '../pages/pathUtils';
import * as sheetCss from './sheet/Sheet.css';

/**
 * The right-click menu of a person in a call, like Discord's: profile, message, volume / mute
 * for me (Element Call's own tile menu) and copy. Opened from a tile inside the call view
 * (see `installCallFrameMenu`) and from the avatars of the call status bar.
 */
export function CallUserMenu() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const callEmbed = useAtomValue(callEmbedAtom);
  const openUserProfile = useOpenUserRoomProfile();
  const [menu, setMenu] = useState<{ anchor: RectCords; userId: string }>();

  useEffect(() => {
    const onMenu = (evt: Event) => {
      const { x, y, userId } = (evt as CustomEvent<CallUserMenuDetail>).detail;
      setMenu({ anchor: { x, y, width: 0, height: 0 }, userId });
    };
    window.addEventListener(CALL_USER_MENU_EVENT, onMenu);
    return () => window.removeEventListener(CALL_USER_MENU_EVENT, onMenu);
  }, []);

  const close = () => setMenu(undefined);

  const userId = menu?.userId;
  const callRoom = callEmbed ? mx.getRoom(callEmbed.roomId) : null;
  const isMe = userId === mx.getUserId();
  const name =
    userId && callRoom
      ? getMemberDisplayName(callRoom, userId) ?? getMxIdLocalPart(userId) ?? userId
      : userId;
  // Element Call has a volume slider and "mute for me" on the tile of everyone but yourself,
  // reachable only while the call view is visible
  const tile = userId && !isMe ? findCallTile(callEmbed?.document, userId) : undefined;
  const tileVisible = !!tile && !isCallFrameHidden(callEmbed?.iframe.style);

  const handleProfile = () => {
    if (!menu || !userId || !callRoom) return;
    openUserProfile(callRoom.roomId, undefined, userId, menu.anchor, 'Right');
    close();
  };
  const handleMessage = () => {
    if (!userId) return;
    close();
    navigate(withSearchParam(getDirectCreatePath(), { userId }));
  };
  const handleVolume = () => {
    close();
    if (!tile) return;
    // the menu of Element Call opens where this one was, in the coordinates of the call view
    const box = callEmbed?.iframe.getBoundingClientRect();
    const point =
      box && menu ? { x: menu.anchor.x - box.left, y: menu.anchor.y - box.top } : undefined;
    window.setTimeout(() => openCallTileMenu(tile, point), 50);
  };
  const handleCopy = (text?: string) => {
    if (text) copyToClipboard(text);
    close();
  };

  return (
    <PopOut
      anchor={menu?.anchor}
      position="Bottom"
      align="Start"
      offset={0}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu className={sheetCss.MenuMaterial}>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              <Text
                size="L400"
                style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                truncate
              >
                {name}
              </Text>
              <Line variant="Surface" size="300" />
              {callRoom && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  onClick={handleProfile}
                >
                  <Text size="T300">Profile</Text>
                </MenuItem>
              )}
              {!isMe && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  onClick={handleMessage}
                >
                  <Text size="T300">Message</Text>
                </MenuItem>
              )}
              {tileVisible && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  onClick={handleVolume}
                >
                  <Text size="T300">Volume & Mute for me…</Text>
                </MenuItem>
              )}
              <Line variant="Surface" size="300" />
              <MenuItem
                className={sheetCss.MenuRow}
                size="300"
                radii="300"
                onClick={() => handleCopy(name)}
              >
                <Text size="T300">Copy Name</Text>
              </MenuItem>
              <MenuItem
                className={sheetCss.MenuRow}
                size="300"
                radii="300"
                onClick={() => handleCopy(userId)}
              >
                <Text size="T300">Copy User ID</Text>
              </MenuItem>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <span />
    </PopOut>
  );
}
