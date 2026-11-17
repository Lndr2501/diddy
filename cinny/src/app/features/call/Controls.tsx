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
import type { ShareAudioOption } from '../../plugins/call';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../../hooks/useAsyncCallback';
import { useTranslation } from 'react-i18next';
import { pushToTalkHoldProps } from './pushToTalkHold';

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

/** "PTT" on the microphone button while push-to-talk runs. */
function PushToTalkBadge() {
  return (
    <span className={css.PushToTalkBadge} aria-hidden>
      PTT
    </span>
  );
}

/** Push-to-talk on the microphone button: it shows whether the microphone is open, holding talks. */
export type MicrophonePushToTalk = {
  open: boolean;
  /** the push-to-talk key, for the tooltip */
  keyLabel?: string;
  /** held, but full mute keeps the microphone closed */
  fullMuted: boolean;
};

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  /** works your iPhone (camera & mic) instead of this computer */
  phone?: boolean;
  ptt?: MicrophonePushToTalk;
};
export function MicrophoneButton({ enabled, onToggle, phone, ptt }: MicrophoneButtonProps) {
  const { t } = useTranslation();
  const [micState, toggleMic] = useAsyncCallback(onToggle);
  const loading = micState.status === AsyncStatus.Loading;
  const what = phone ? t('call.controls.phoneMicrophone') : t('call.controls.microphone');

  if (ptt) {
    let tip = ptt.keyLabel ? `Hold to talk (${ptt.keyLabel})` : 'Hold to talk';
    if (ptt.fullMuted) tip = 'Full mute is on: turn on sound to talk';
    else if (ptt.open) tip = `Talking${phone ? ' on your iPhone' : ''}`;
    return (
      <TooltipProvider
        position="Top"
        delay={500}
        tooltip={
          <Tooltip>
            <Text size="T200">{tip}</Text>
          </Tooltip>
        }
      >
        {(anchorRef) => (
          <IconButton
            ref={anchorRef}
            variant={ptt.open ? 'Success' : 'SurfaceVariant'}
            fill="Soft"
            radii="400"
            size="400"
            className={css.ControlButton}
            aria-label={`Push to talk: hold to talk${phone ? ' on your iPhone' : ''}`}
            aria-pressed={ptt.open}
            {...pushToTalkHoldProps}
          >
            <Icon size="400" src={ptt.open ? Icons.Mic : Icons.MicMute} filled={ptt.open} />
            {phone ? <PhoneBadge /> : <PushToTalkBadge />}
          </IconButton>
        )}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? t('call.controls.turnOff', { what }) : t('call.controls.turnOn', { what })}
          </Text>
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
          aria-label={
            enabled
              ? t('call.controls.turnOffLowercase', { lowerCase: what.toLowerCase() })
              : t('call.controls.turnOnLowercase', { lowerCase: what.toLowerCase() })
          }
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
  const { t } = useTranslation();
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? t('call.controls.turnOffSound') : t('call.controls.turnOnSound')}
          </Text>
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
  const { t } = useTranslation();
  const [videoState, toggleVideo] = useAsyncCallback(onToggle);
  const loading = videoState.status === AsyncStatus.Loading;
  const what = phone ? t('call.controls.phoneCamera') : t('call.controls.camera');

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? t('call.controls.stop', { what }) : t('call.controls.start', { what })}
          </Text>
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
  const { t } = useTranslation();
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {enabled ? t('call.controls.stopScreenshare') : t('call.controls.startScreenshare')}
          </Text>
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
  const { t } = useTranslation();
  const [chat, setChat] = useAtom(callChatAtom);

  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">
            {chat ? t('call.controls.closeChat') : t('call.controls.openChat')}
          </Text>
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
  const { t } = useTranslation();
  return (
    <TooltipProvider
      position="Top"
      delay={500}
      tooltip={
        <Tooltip>
          <Text size="T200">{t('call.controls.reactions')}</Text>
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
          aria-label={t('call.controls.reactions')}
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
  /**
   * null: the system sound cannot be shared on this device, no toggle.
   * { unavailable }: shown greyed out with the reason (older Windows).
   */
  audio: ShareAudioOption;
  onStop: () => void;
};
/** Chevron next to the share button while sharing: system sound on/off, stop sharing. */
export function ShareOptionsButton({ audio, onStop }: ShareOptionsButtonProps) {
  const { t } = useTranslation();
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
              {audio && 'unavailable' in audio && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  disabled
                  aria-disabled
                  title={audio.unavailable}
                  before={<Icon size="100" src={Icons.VolumeMute} />}
                >
                  <Box direction="Column" gap="100">
                    <Text size="T300">Share system sound</Text>
                    <Text size="T200" priority="300" style={{ whiteSpace: 'normal' }}>
                      {audio.unavailable}
                    </Text>
                  </Box>
                </MenuItem>
              )}
              {audio && 'enabled' in audio && (
                <MenuItem
                  className={sheetCss.MenuRow}
                  size="300"
                  radii="300"
                  aria-pressed={audio.enabled}
                  before={
                    <Icon size="100" src={audio.enabled ? Icons.VolumeHigh : Icons.VolumeMute} />
                  }
                  after={audio.enabled ? <Icon size="100" src={Icons.Check} /> : undefined}
                  onClick={() => {
                    audio.onToggle();
                    close();
                  }}
                >
                  <Text size="T300">{t('call.controls.shareSystemSound')}</Text>
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
                <Text size="T300">{t('call.controls.stopSharing')}</Text>
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
        aria-label={t('call.controls.sharingOptions')}
        title={t('call.controls.sharingOptions')}
      >
        <Icon size="50" src={Icons.ChevronTop} />
      </IconButton>
    </PopOut>
  );
}

export type PhoneButtonState = 'idle' | 'waiting' | 'connected';

/** "iPhone as camera & mic": opens the dialog; shows waiting and connected (CompanionDialog.tsx). */
export function PhoneButton({ state, onClick }: { state: PhoneButtonState; onClick: () => void }) {
  const { t } = useTranslation();
  let label = t('call.controls.usePhoneAsCamera');
  if (state === 'waiting') label = t('call.controls.waitingForYourPhone');
  if (state === 'connected') label = t('call.controls.phoneConnected');
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
  const { t } = useTranslation();
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
                <Text size="T300">{t('call.controls.spotlightView')}</Text>
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
                  <Text size="T300">{t('call.controls.phoneAsCameraMic')}</Text>
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
                <Text size="T300">{t('call.controls.callSettings')}</Text>
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
        aria-label={t('call.controls.more')}
        title={t('call.controls.more')}
      >
        <Icon size="400" src={Icons.HorizontalDots} />
      </IconButton>
    </PopOut>
  );
}
