import React from 'react';
import { Icon, IconButton, Icons, Line, Text, Tooltip, TooltipProvider } from 'folds';
import { useAtom } from 'jotai';
import * as css from './styles.css';
import { callChatAtom } from '../../state/callEmbed';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';

export function ControlDivider() {
  return (
    <Line variant="SurfaceVariant" size="300" direction="Vertical" className={css.ControlDivider} />
  );
}

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
};
export function MicrophoneButton({ enabled, onToggle }: MicrophoneButtonProps) {
  const [micState, toggleMic] = useAsyncCallback(onToggle);
  const loading = micState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Microphone' : 'Turn On Microphone'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'SurfaceVariant' : 'Critical'}
          fill="Soft"
          radii="Pill"
          size="400"
          className={css.ControlButton}
          onClick={toggleMic}
          disabled={loading}
        >
          <Icon size="400" src={enabled ? Icons.Mic : Icons.MicMute} filled={!enabled} />
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
          radii="Pill"
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
};
export function VideoButton({ enabled, onToggle }: VideoButtonProps) {
  const [videoState, toggleVideo] = useAsyncCallback(onToggle);
  const loading = videoState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Camera' : 'Start Camera'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Primary' : 'SurfaceVariant'}
          fill="Soft"
          radii="Pill"
          size="400"
          className={css.ControlButton}
          onClick={toggleVideo}
          disabled={loading}
        >
          <Icon
            size="400"
            src={enabled ? Icons.VideoCamera : Icons.VideoCameraMute}
            filled={enabled}
          />
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
          radii="Pill"
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

type ScreenShareAudioButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
export function ScreenShareAudioButton({ enabled, onToggle }: ScreenShareAudioButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Systemton teilen: an (ohne Diddy)' : 'Systemton teilen: aus'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Primary' : 'Critical'}
          fill="Soft"
          radii="Pill"
          size="400"
          className={css.ControlButton}
          aria-label="Systemton teilen (alle anderen Apps)"
          aria-pressed={enabled}
          onClick={() => onToggle()}
        >
          <Icon size="400" src={enabled ? Icons.VolumeHigh : Icons.VolumeMute} filled={!enabled} />
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
          radii="Pill"
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

type ViewToggleButtonProps = {
  active: boolean;
  onToggle: () => void;
};
export function SpotlightButton({ active, onToggle }: ViewToggleButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{active ? 'Grid View' : 'Spotlight View'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={active ? 'Primary' : 'SurfaceVariant'}
          fill="Soft"
          radii="Pill"
          size="400"
          className={css.ControlButton}
          onClick={() => onToggle()}
          aria-pressed={active}
          aria-label={active ? 'Grid View' : 'Spotlight View'}
        >
          <Icon size="400" src={Icons.Category} filled={active} />
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
          radii="Pill"
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

export function CallSettingsButton({ onClick }: SimpleControlButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">Call Settings</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant="SurfaceVariant"
          fill="Soft"
          radii="Pill"
          size="400"
          className={css.ControlButton}
          onClick={() => onClick()}
          aria-label="Call Settings"
        >
          <Icon size="400" src={Icons.Setting} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}
