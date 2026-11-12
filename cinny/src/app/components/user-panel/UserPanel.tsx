import React, {
  KeyboardEventHandler,
  MouseEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtomValue } from 'jotai';
import {
  Avatar,
  Box,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
} from 'folds';
import * as css from './UserPanel.css';
import { UserAvatar } from '../user-avatar';
import { StatusIcon } from '../presence/StatusIcon';
import { stateOfChosen } from '../../utils/presenceState';
import { STATUS_OPTIONS, UserPanelFace, statusInfo, userPanelAvatarUrl } from './UserPanelFace';
import { SettingsSheet } from '../SettingsSheet';
import { Settings } from '../../features/settings';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useCallJoined } from '../../hooks/useCallEmbed';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { callEmbedAtom } from '../../state/callEmbed';
import { DeviceChevron } from '../../features/call/DevicePicker';
import { setMyStatus, useMyStatus } from '../../plugins/diddy/status';
import { DiddyStatus } from '../../plugins/diddy/types';
import { getMxIdLocalPart } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';
import { useOwnAgentTalking } from '../../state/agentVoice';
import { ConnectionsMenu } from '../connection-recovery/AccountSwitcher';
import { ConnectionOverview } from '../connection-recovery/ConnectionRecovery';
import { getConnectionProfile, recordAccount, visibleHomeserver } from '../../plugins/connections';
import { openIntro } from '../../plugins/diddy/intro';
import { nextMenuIndex } from '../../utils/menuKeys';

type ActiveCallButtonsProps = {
  callEmbed: CallEmbed;
};
// Wired to the running call. Only mounted while a call embed exists.
function ActiveCallButtons({ callEmbed }: ActiveCallButtonsProps) {
  const { microphone, sound } = useCallControlState(callEmbed.control);
  const joined = useCallJoined(callEmbed);

  const handleMicrophone = useCallback(() => {
    callEmbed.control.toggleMicrophone();
  }, [callEmbed]);
  const handleSound = useCallback(() => {
    callEmbed.control.toggleSound();
  }, [callEmbed]);

  return (
    <>
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-muted={!microphone}
        aria-label={microphone ? 'Mute microphone' : 'Unmute microphone'}
        title={microphone ? 'Mute microphone' : 'Unmute microphone'}
        aria-pressed={!microphone}
        disabled={!joined}
        onClick={handleMicrophone}
      >
        <Icon size="100" src={microphone ? Icons.Mic : Icons.MicMute} filled={!microphone} />
      </IconButton>
      <DeviceChevron kind="input" className={css.UserPanelChevron} />
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-muted={!sound}
        aria-label={sound ? 'Deafen' : 'Undeafen'}
        title={sound ? 'Deafen' : 'Undeafen'}
        aria-pressed={!sound}
        disabled={!joined}
        onClick={handleSound}
      >
        <Icon size="100" src={sound ? Icons.Headphone : Icons.HeadphoneMute} filled={!sound} />
      </IconButton>
      <DeviceChevron kind="output" className={css.UserPanelChevron} />
    </>
  );
}

// No call running: visual only, nothing happens on click.
function IdleCallButtons() {
  return (
    <>
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-inactive
        aria-label="Microphone (join a call to use)"
        title="Join a call to use the microphone"
        aria-disabled
        tabIndex={-1}
      >
        <Icon size="100" src={Icons.Mic} />
      </IconButton>
      <DeviceChevron kind="input" className={css.UserPanelChevron} />
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="300"
        className={css.UserPanelButton}
        data-inactive
        aria-label="Headphones (join a call to use)"
        title="Join a call to use the headphones"
        aria-disabled
        tabIndex={-1}
      >
        <Icon size="100" src={Icons.Headphone} />
      </IconButton>
      <DeviceChevron kind="output" className={css.UserPanelChevron} />
    </>
  );
}

type StatusOptionsProps = {
  status: DiddyStatus;
  onSelect: (status: DiddyStatus) => void;
};
/**
 * Native-like status list (#21): it opens with the current status focused and arrow keys /
 * Home / End move through it. Escape is handled by the account menu itself.
 */
function StatusOptions({ status, onSelect }: StatusOptionsProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const selected = STATUS_OPTIONS.findIndex((o) => o.status === status);
    itemRefs.current[selected >= 0 ? selected : 0]?.focus();
    // only when the menu opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (evt) => {
    const items = itemRefs.current;
    const current = items.findIndex((item) => item === document.activeElement);
    const next = nextMenuIndex(current, evt.key, STATUS_OPTIONS.length);
    if (next === undefined) return;
    evt.preventDefault();
    items[next]?.focus();
  };

  return (
    <Box direction="Column" gap="100" role="menu" aria-label="Status" onKeyDown={handleKeyDown}>
      {STATUS_OPTIONS.map((option, index) => (
        <MenuItem
          key={option.status}
          ref={(el: HTMLButtonElement | null) => {
            itemRefs.current[index] = el;
          }}
          size="300"
          variant="Surface"
          radii="300"
          role="menuitemradio"
          aria-checked={option.status === status}
          tabIndex={option.status === status ? 0 : -1}
          className={option.description ? css.StatusMenuItemTall : undefined}
          before={
            <span className={css.StatusMenuDot}>
              <StatusIcon state={stateOfChosen(option.status)} size={12} decorative />
            </span>
          }
          after={option.status === status ? <Icon size="100" src={Icons.Check} /> : undefined}
          onClick={() => onSelect(option.status)}
        >
          <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
            <Text size="B300" truncate>
              {option.label}
            </Text>
            {option.description && (
              <Text size="T200" priority="300" className={css.StatusMenuDescription}>
                {option.description}
              </Text>
            )}
          </Box>
        </MenuItem>
      ))}
    </Box>
  );
}

export function UserPanel() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  // tells the settings list of accounts who is signed in in this window (#156)
  useEffect(() => recordAccount(userId), [userId]);
  const profile = useUserProfile(userId);
  const callEmbed = useAtomValue(callEmbedAtom);
  const [settings, setSettings] = useState(false);
  const [manage, setManage] = useState(false);
  const [statusCords, setStatusCords] = useState<RectCords>();

  const storedStatus = useMyStatus(mx);
  // Show the pick right away; the profile event follows a moment later.
  const [pickedStatus, setPickedStatus] = useState<DiddyStatus>();
  useEffect(() => setPickedStatus(undefined), [storedStatus]);
  const status = pickedStatus ?? storedStatus;
  const agentTalking = useOwnAgentTalking();
  const statusLabel = agentTalking ? 'Talking to agent' : statusInfo(status).label;

  const statusMenuRef = useRef<HTMLDivElement>(null);
  const statusButtonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click / Escape. A second click on the profile button toggles the menu, so
  // clicks on the button itself are left to its own handler.
  useEffect(() => {
    if (!statusCords) return undefined;
    const onPointerDown = (evt: PointerEvent) => {
      const target = evt.target as Node | null;
      if (!target) return;
      if (statusMenuRef.current?.contains(target) || statusButtonRef.current?.contains(target)) {
        return;
      }
      setStatusCords(undefined);
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Escape') return;
      setStatusCords(undefined);
      statusButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [statusCords]);

  const handleOpenStatus: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const cords = evt.currentTarget.getBoundingClientRect();
    setStatusCords((current) => (current ? undefined : cords));
  };
  const handleSelectStatus = (next: DiddyStatus) => {
    setStatusCords(undefined);
    setPickedStatus(next);
    setMyStatus(mx, next);
  };

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = userPanelAvatarUrl(mx, profile.avatarUrl, useAuthentication);
  const connection = getConnectionProfile();
  const serverLabel = connection
    ? visibleHomeserver(connection.server).replace(/^https?:\/\//, '')
    : mx.getDomain() ?? '';

  const closeMenu = () => setStatusCords(undefined);
  const avatar = (size: 'H4' | 'H6') => (
    <UserAvatar
      surface="account"
      userId={userId}
      src={avatarUrl}
      renderFallback={() => <Text size={size}>{nameInitials(displayName)}</Text>}
    />
  );

  return (
    <div className={css.UserPanel}>
      <PopOut
        anchor={statusCords}
        position="Top"
        align="Start"
        content={
          // Account menu (formerly the avatar at the bottom of the space rail): who you are,
          // your status, the other connections, settings.
          <div ref={statusMenuRef}>
            <Menu>
              <ConnectionsMenu
                account={
                  <>
                    <Box alignItems="Center" gap="300" style={{ padding: 4 }}>
                      <Avatar size="400" radii="Pill" style={{ flexShrink: 0 }}>
                        {avatar('H4')}
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
                    <StatusOptions status={status} onSelect={handleSelectStatus} />
                  </>
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
          </div>
        }
      >
        <button
          ref={statusButtonRef}
          type="button"
          className={css.UserPanelProfileButton}
          onClick={handleOpenStatus}
          aria-haspopup="menu"
          aria-expanded={statusCords !== undefined}
          aria-label={`Account and status (${statusLabel})`}
          title="Account and status"
          data-agent={agentTalking || undefined}
        >
          <UserPanelFace
            userId={userId}
            displayName={displayName}
            avatarUrl={avatarUrl}
            status={status}
            agentTalking={agentTalking}
          />
        </button>
      </PopOut>
      <div className={css.UserPanelActions}>
        {callEmbed ? <ActiveCallButtons callEmbed={callEmbed} /> : <IdleCallButtons />}
        <IconButton
          variant="SurfaceVariant"
          fill="None"
          size="300"
          radii="300"
          className={css.UserPanelButton}
          aria-label="User settings"
          title="User settings"
          onClick={() => setSettings(true)}
        >
          <Icon size="100" src={Icons.Setting} />
        </IconButton>
      </div>
      {settings && (
        <SettingsSheet requestClose={() => setSettings(false)}>
          <Settings requestClose={() => setSettings(false)} />
        </SettingsSheet>
      )}
      <ConnectionOverview open={manage} onClose={() => setManage(false)} />
    </div>
  );
}
