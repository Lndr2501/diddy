import React, { MouseEventHandler, useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import FocusTrap from 'focus-trap-react';
import {
  Avatar,
  Box,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  toRem,
} from 'folds';
import * as css from './UserPanel.css';
import { UserAvatar } from '../user-avatar';
import { Modal500 } from '../Modal500';
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
import { stopPropagation } from '../../utils/keyboard';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../utils/matrix';
import { nameInitials } from '../../utils/common';

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
      <DeviceChevron kind="input" />
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
      <DeviceChevron kind="output" />
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
      <DeviceChevron kind="input" />
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
      <DeviceChevron kind="output" />
    </>
  );
}

const STATUS_OPTIONS: { status: DiddyStatus; label: string; color: string }[] = [
  { status: 'online', label: 'Online', color: '#43B581' },
  { status: 'idle', label: 'Idle', color: '#F0B232' },
  { status: 'dnd', label: 'Do Not Disturb', color: '#F04747' },
  { status: 'invisible', label: 'Invisible', color: '#747F8D' },
];

const statusInfo = (status: DiddyStatus) =>
  STATUS_OPTIONS.find((o) => o.status === status) ?? STATUS_OPTIONS[0];

type StatusMenuProps = {
  status: DiddyStatus;
  onSelect: (status: DiddyStatus) => void;
};
function StatusMenu({ status, onSelect }: StatusMenuProps) {
  return (
    <Menu style={{ minWidth: toRem(190) }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        {STATUS_OPTIONS.map((option) => (
          <MenuItem
            key={option.status}
            size="300"
            variant="Surface"
            radii="300"
            aria-pressed={option.status === status}
            before={
              <span className={css.StatusMenuDot} style={{ backgroundColor: option.color }} />
            }
            after={option.status === status ? <Icon size="100" src={Icons.Check} /> : undefined}
            onClick={() => onSelect(option.status)}
          >
            <Text size="B300" truncate style={{ flexGrow: 1 }}>
              {option.label}
            </Text>
          </MenuItem>
        ))}
      </Box>
    </Menu>
  );
}

export function UserPanel() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const callEmbed = useAtomValue(callEmbedAtom);
  const [settings, setSettings] = useState(false);
  const [statusCords, setStatusCords] = useState<RectCords>();

  const storedStatus = useMyStatus(mx);
  // Show the pick right away; the profile event follows a moment later.
  const [pickedStatus, setPickedStatus] = useState<DiddyStatus>();
  useEffect(() => setPickedStatus(undefined), [storedStatus]);
  const status = pickedStatus ?? storedStatus;
  const { label: statusLabel, color: statusColor } = statusInfo(status);

  const handleOpenStatus: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setStatusCords(evt.currentTarget.getBoundingClientRect());
  };
  const handleSelectStatus = (next: DiddyStatus) => {
    setStatusCords(undefined);
    setPickedStatus(next);
    setMyStatus(mx, next);
  };

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined
    : undefined;

  return (
    <div className={css.UserPanel}>
      <PopOut
        anchor={statusCords}
        position="Top"
        align="Start"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setStatusCords(undefined),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <StatusMenu status={status} onSelect={handleSelectStatus} />
          </FocusTrap>
        }
      >
        <button
          type="button"
          className={css.UserPanelProfileButton}
          onClick={handleOpenStatus}
          aria-pressed={statusCords !== undefined}
          aria-label={`Status: ${statusLabel}. Change status`}
          title="Change status"
        >
          <span className={css.UserPanelAvatarWrap}>
            <Avatar size="300" radii="Pill">
              <UserAvatar
                userId={userId}
                src={avatarUrl}
                renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
              />
            </Avatar>
            <span
              className={css.UserPanelOnlineDot}
              style={{ backgroundColor: statusColor }}
              aria-hidden
            />
          </span>
          <div className={css.UserPanelText}>
            <Text size="T300" priority="500" truncate>
              <b>{displayName}</b>
            </Text>
            <Text size="T200" priority="300" truncate>
              {statusLabel}
            </Text>
          </div>
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
        <Modal500 requestClose={() => setSettings(false)}>
          <Settings requestClose={() => setSettings(false)} />
        </Modal500>
      )}
    </div>
  );
}
