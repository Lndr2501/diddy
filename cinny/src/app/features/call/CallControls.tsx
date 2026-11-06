import React, { MouseEventHandler, useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import * as css from './styles.css';
import { SoundboardButton } from './Soundboard';
import { DeviceChevron } from './DevicePicker';
import {
  ChatButton,
  ControlDivider,
  MicrophoneButton,
  ScreenShareAudioButton,
  ScreenShareButton,
  SoundButton,
  VideoButton,
} from './Controls';
import { CallEmbed, useCallControlState, useScreenShareAudio } from '../../plugins/call';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { stopPropagation } from '../../utils/keyboard';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';

type CallControlsProps = {
  callEmbed: CallEmbed;
};
export function CallControls({ callEmbed }: CallControlsProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(document.body.clientWidth < 500);

  useResizeObserver(
    useCallback(() => {
      const element = controlRef.current;
      if (!element) return;
      setCompact(element.clientWidth < 500);
    }, []),
    useCallback(() => controlRef.current, [])
  );

  const { microphone, video, sound, screenshare, spotlight } = useCallControlState(
    callEmbed.control
  );

  const streamAudio = useScreenShareAudio();

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSpotlightClick = () => {
    callEmbed.control.toggleSpotlight();
    setCords(undefined);
  };

  const handleReactionsClick = () => {
    callEmbed.control.toggleReactions();
    setCords(undefined);
  };

  const handleSettingsClick = () => {
    callEmbed.control.toggleSettings();
    setCords(undefined);
  };

  const handleMicrophoneToggle = useCallback(() => callEmbed.control.toggleMicrophone(), [callEmbed]);
  const handleVideoToggle = useCallback(() => callEmbed.control.toggleVideo(), [callEmbed]);

  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  return (
    <Box
      ref={controlRef}
      className={css.CallControlContainer}
      justifyContent="Center"
      alignItems="Center"
    >
      <Box
        className={css.ControlCard}
        gap="200"
        alignItems="Center"
        justifyContent="Center"
        wrap={compact ? 'Wrap' : 'NoWrap'}
      >
        <Box alignItems="Center" gap="100">
          <MicrophoneButton enabled={microphone} onToggle={handleMicrophoneToggle} />
          <DeviceChevron kind="input" size="bar" />
        </Box>
        <Box alignItems="Center" gap="100">
          <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
          <DeviceChevron kind="output" size="bar" />
        </Box>
        {!compact && <ControlDivider />}
        <VideoButton enabled={video} onToggle={handleVideoToggle} />
        <ScreenShareButton
          enabled={screenshare}
          onToggle={() => callEmbed.control.toggleScreenshare()}
        />
        {screenshare && streamAudio.available && streamAudio.active && (
          <ScreenShareAudioButton enabled={streamAudio.enabled} onToggle={streamAudio.toggle} />
        )}
        {!compact && <ControlDivider />}
        <ChatButton />
        <SoundboardButton />
        <PopOut
          anchor={cords}
          position="Top"
          align="Center"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setCords(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu>
                <Box direction="Column" style={{ padding: config.space.S100 }}>
                  <MenuItem
                    size="300"
                    variant="Surface"
                    radii="300"
                    onClick={handleSpotlightClick}
                  >
                    <Text size="B300" truncate>
                      {spotlight ? 'Grid View' : 'Spotlight View'}
                    </Text>
                  </MenuItem>
                  <MenuItem
                    size="300"
                    variant="Surface"
                    radii="300"
                    onClick={handleReactionsClick}
                  >
                    <Text size="B300" truncate>
                      Reactions
                    </Text>
                  </MenuItem>
                  <MenuItem
                    size="300"
                    variant="Surface"
                    radii="300"
                    onClick={handleSettingsClick}
                  >
                    <Text size="B300" truncate>
                      Settings
                    </Text>
                  </MenuItem>
                </Box>
              </Menu>
            </FocusTrap>
          }
        >
          <IconButton
            variant="SurfaceVariant"
            fill="Soft"
            radii="400"
            size="400"
            className={css.ControlButton}
            onClick={handleOpenMenu}
            aria-pressed={!!cords}
          >
            <Icon size="400" src={Icons.VerticalDots} />
          </IconButton>
        </PopOut>
        <Button
          className={css.ControlPrimaryButton}
          style={compact ? { flexGrow: 1 } : undefined}
          variant="Primary"
          fill="Solid"
          onClick={hangup}
          before={
            exiting ? (
              <Spinner variant="Primary" fill="Solid" size="200" />
            ) : (
              <Icon src={Icons.PhoneDown} size="200" filled />
            )
          }
          disabled={exiting}
        >
          <Text size="B400">End</Text>
        </Button>
      </Box>
    </Box>
  );
}
