import React, { useEffect, useState } from 'react';
import {
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  toRem,
} from 'folds';
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
import { RangeInput } from './diddy/RangeInput';
import { ShareVolume, useShareVolume } from '../features/call/useShareVolume';
import * as sheetCss from './sheet/Sheet.css';

/** The volume of somebody's screen share, for you only: mute button and slider. */
export function StreamVolume({ volume }: { volume: ShareVolume }) {
  const percent = Math.round(volume.volume * 100);
  const muted = volume.volume === 0;
  if (!volume.hasAudio) {
    return (
      <Text
        size="T200"
        priority="300"
        style={{ padding: `${config.space.S100} ${config.space.S200}` }}
      >
        This stream has no sound
      </Text>
    );
  }
  return (
    <Box
      direction="Column"
      gap="100"
      style={{ padding: `${config.space.S100} ${config.space.S200} ${config.space.S200}` }}
    >
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
        <Text size="T300">Stream Volume</Text>
        <Text size="T200" priority="300" aria-hidden>
          {muted ? 'Muted' : `${percent}%`}
        </Text>
      </Box>
      <Box alignItems="Center" gap="200">
        <IconButton
          size="300"
          radii="300"
          variant={muted ? 'Critical' : 'SurfaceVariant'}
          fill={muted ? 'Soft' : 'None'}
          aria-pressed={muted}
          aria-label={muted ? 'Unmute stream for me' : 'Mute stream for me'}
          title={muted ? 'Unmute stream for me' : 'Mute stream for me'}
          onClick={volume.toggleMuted}
        >
          <Icon size="100" src={muted ? Icons.VolumeMute : Icons.VolumeHigh} />
        </IconButton>
        <RangeInput
          aria-label="Stream volume"
          aria-valuetext={muted ? 'Muted' : `${percent}%`}
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(evt) => volume.setVolume(Number(evt.currentTarget.value) / 100)}
          onPointerUp={volume.commit}
          onKeyUp={volume.commit}
          onBlur={volume.commit}
        />
      </Box>
    </Box>
  );
}

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
  const [menu, setMenu] = useState<{ anchor: RectCords; userId: string; shareId?: string }>();

  useEffect(() => {
    const onMenu = (evt: Event) => {
      const { x, y, userId, shareId } = (evt as CustomEvent<CallUserMenuDetail>).detail;
      setMenu({ anchor: { x, y, width: 0, height: 0 }, userId, shareId });
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
  // opened on somebody else's screen share: its sound, turned down only for you
  const streamVolume = useShareVolume(
    callEmbed?.document,
    menu?.shareId && !isMe ? menu.shareId : undefined,
    userId
  );

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
          <Menu className={sheetCss.MenuMaterial} style={{ minWidth: toRem(232) }}>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              <Text
                size="L400"
                style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                truncate
              >
                {name}
              </Text>
              <Line variant="Surface" size="300" />
              {streamVolume && (
                <>
                  <StreamVolume volume={streamVolume} />
                  <Line variant="Surface" size="300" />
                </>
              )}
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
                  <Text size="T300">
                    {streamVolume ? 'Voice Volume & Mute for me…' : 'Volume & Mute for me…'}
                  </Text>
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
