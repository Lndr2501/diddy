import React, { MouseEventHandler, useCallback, useState } from 'react';
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
  Spinner,
  Text,
  toRem,
  Tooltip,
  TooltipProvider,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtom } from 'jotai';
import { stopPropagation } from '../../utils/keyboard';
import * as sheetCss from '../../components/sheet/Sheet.css';
import * as css from './styles.css';
import { callChatAtom } from '../../state/callEmbed';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../../hooks/useAsyncCallback';

export function ControlDivider() {
  return (
    <Line variant="SurfaceVariant" size="300" direction="Vertical" className={css.ControlDivider} />
  );
}

/** A small iPhone on a button that works your iPhone instead of this computer. */
function PhoneBadge() {
  return (
    <span className={css.PhoneBadge} aria-hidden>
      <Icon size="50" src={Icons.Phone} filled />
    </span>
  );
}

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  /** works your iPhone (camera & mic) instead of this computer */
  phone?: boolean;
};
export function MicrophoneButton({ enabled, onToggle, phone }: MicrophoneButtonProps) {
  const [micState, toggleMic] = useAsyncCallback(onToggle);
  const loading = micState.status === AsyncStatus.Loading;
  const what = phone ? 'iPhone Microphone' : 'Microphone';

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? `Turn Off ${what}` : `Turn On ${what}`}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'SurfaceVariant' : 'Critical'}
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          onClick={ignoreRejection(toggleMic)}
          disabled={loading}
          aria-label={enabled ? `Turn off ${what.toLowerCase()}` : `Turn on ${what.toLowerCase()}`}
        >
          <Icon size="400" src={enabled ? Icons.Mic : Icons.MicMute} filled={!enabled} />
          {phone && <PhoneBadge />}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SoundButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function SoundButton({ enabled, onToggle }: SoundButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Sound' : 'Turn On Sound'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'SurfaceVariant' : 'Critical'}
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          onClick={() => onToggle()}
        >
          <Icon
            size="400"
            src={enabled ? Icons.Headphone : Icons.HeadphoneMute}
            filled={!enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type VideoButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  /** works your iPhone (camera & mic) instead of this computer */
  phone?: boolean;
};
export function VideoButton({ enabled, onToggle, phone }: VideoButtonProps) {
  const [videoState, toggleVideo] = useAsyncCallback(onToggle);
  const loading = videoState.status === AsyncStatus.Loading;
  const what = phone ? 'iPhone Camera' : 'Camera';

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? `Stop ${what}` : `Start ${what}`}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Primary' : 'SurfaceVariant'}
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          onClick={ignoreRejection(toggleVideo)}
          disabled={loading}
        >
          <Icon
            size="400"
            src={enabled ? Icons.VideoCamera : Icons.VideoCameraMute}
            filled={enabled}
          />
          {phone && <PhoneBadge />}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type ScreenShareButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function ScreenShareButton({ enabled, onToggle }: ScreenShareButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Screenshare' : 'Start Screenshare'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Primary' : 'SurfaceVariant'}
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          onClick={() => onToggle()}
        >
          <Icon size="400" src={Icons.ScreenShare} filled={enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

export function ChatButton() {
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{chat ? 'Close Chat' : 'Open Chat'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={chat ? 'Primary' : 'SurfaceVariant'}
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          onClick={() => setChat(!chat)}
        >
          <Icon size="400" src={Icons.Message} filled={chat} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SimpleControlButtonProps = {
  onClick: () => void;
};
export function ReactionsButton({ onClick }: SimpleControlButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">Reactions</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant="SurfaceVariant"
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          onClick={() => onClick()}
          aria-label="Reactions"
        >
          <Icon size="400" src={Icons.Smile} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

/** Small menu anchored to a bar button, closed by a click outside or Escape. */
function useBarMenu() {
  const [cords, setCords] = useState<RectCords>();
  const close = useCallback(() => setCords(undefined), []);
  const toggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    const rect = evt.currentTarget.getBoundingClientRect();
    setCords((current) => (current ? undefined : rect));
  };
  return { cords, close, toggle };
}

type ShareOptionsButtonProps = {
  /** null: the system sound cannot be shared on this device, no toggle */
  audio: { enabled: boolean; onToggle: () => void } | null;
  onStop: () => void;
};
/** Chevron next to the share button while sharing: system sound on/off, stop sharing. */
export function ShareOptionsButton({ audio, onStop }: ShareOptionsButtonProps) {
  const { cords, close, toggle } = useBarMenu();
  return (
    <PopOut
      anchor={cords}
      position="Top"
      align="Center"
      offset={10}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu className={sheetCss.MenuMaterial} style={{ minWidth: toRem(240) }}>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              {audio && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  aria-pressed={audio.enabled}
                  before={<Icon size="100" src={audio.enabled ? Icons.VolumeHigh : Icons.VolumeMute} />}
                  after={audio.enabled ? <Icon size="100" src={Icons.Check} /> : undefined}
                  onClick={() => {
                    audio.onToggle();
                    close();
                  }}
                >
                  <Text size="T300">Share system sound</Text>
                </MenuItem>
              )}
              <MenuItem
                className={sheetCss.MenuRow}
                size="300"
                radii="300"
                variant="Critical"
                before={<Icon size="100" src={Icons.Cross} />}
                onClick={() => {
                  close();
                  onStop();
                }}
              >
                <Text size="T300">Stop sharing</Text>
              </MenuItem>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        variant="Primary"
        fill="Soft"
        size="400"
        className={css.ControlChevron}
        onClick={toggle}
        aria-pressed={!!cords}
        aria-label="Sharing options"
        title="Sharing options"
      >
        <Icon size="50" src={Icons.ChevronTop} />
      </IconButton>
    </PopOut>
  );
}

export type PhoneButtonState = 'idle' | 'waiting' | 'connected';

/** "iPhone as camera & mic": opens the dialog; shows waiting and connected (CompanionDialog.tsx). */
export function PhoneButton({ state, onClick }: { state: PhoneButtonState; onClick: () => void }) {
  let label = 'Use iPhone as Camera & Mic';
  if (state === 'waiting') label = 'Waiting for Your iPhone…';
  if (state === 'connected') label = 'iPhone Connected';
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{label}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={state === 'connected' ? 'Success' : 'SurfaceVariant'}
          fill="Soft"
          radii="400"
          size="400"
          className={css.ControlButton}
          data-waiting={state === 'waiting' || undefined}
          onClick={onClick}
          aria-label={label}
          aria-pressed={state === 'connected'}
        >
          {state === 'waiting' ? (
            <Spinner size="200" variant="Secondary" />
          ) : (
            <Icon size="400" src={Icons.Phone} filled={state === 'connected'} />
          )}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type MoreButtonProps = {
  spotlight: boolean;
  onToggleSpotlight: () => void;
  onSettings: () => void;
  /** "iPhone as camera & mic…" (CompanionDialog.tsx) */
  onPhone?: () => void;
};
/** Things used now and then: the view of the call and the call settings. */
export function MoreButton({ spotlight, onToggleSpotlight, onSettings, onPhone }: MoreButtonProps) {
  const { cords, close, toggle } = useBarMenu();
  return (
    <PopOut
      anchor={cords}
      position="Top"
      align="End"
      offset={10}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: close,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu className={sheetCss.MenuMaterial} style={{ minWidth: toRem(220) }}>
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              <MenuItem
                className={sheetCss.MenuRow}
                size="300"
                radii="300"
                aria-pressed={spotlight}
                before={<Icon size="100" src={Icons.Category} />}
                after={spotlight ? <Icon size="100" src={Icons.Check} /> : undefined}
                onClick={() => {
                  onToggleSpotlight();
                  close();
                }}
              >
                <Text size="T300">Spotlight view</Text>
              </MenuItem>
              {onPhone && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  before={<Icon size="100" src={Icons.Phone} />}
                  onClick={() => {
                    close();
                    onPhone();
                  }}
                >
                  <Text size="T300">iPhone as camera & mic…</Text>
                </MenuItem>
              )}
              <MenuItem
                className={sheetCss.MenuRow}
                size="300"
                radii="300"
                before={<Icon size="100" src={Icons.Setting} />}
                onClick={() => {
                  close();
                  onSettings();
                }}
              >
                <Text size="T300">Call settings</Text>
              </MenuItem>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      <IconButton
        variant="SurfaceVariant"
        fill="Soft"
        size="400"
        className={css.ControlButton}
        onClick={toggle}
        aria-pressed={!!cords}
        aria-label="More"
        title="More"
      >
        <Icon size="400" src={Icons.HorizontalDots} />
      </IconButton>
    </PopOut>
  );
}
