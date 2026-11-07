import React, { useCallback, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import * as css from './styles.css';
import { SoundboardButton } from './Soundboard';
import { DeviceChevron } from './DevicePicker';
import {
  CallSettingsButton,
  ChatButton,
  ControlDivider,
  MicrophoneButton,
  ReactionsButton,
  ScreenShareAudioButton,
  ScreenShareButton,
  SoundButton,
  SpotlightButton,
  VideoButton,
} from './Controls';
import { CallEmbed, useCallControlState, useScreenShareAudio } from '../../plugins/call';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';

type CallControlsProps = {
  callEmbed: CallEmbed;
};
export function CallControls({ callEmbed }: CallControlsProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(document.body.clientWidth < 760);

  useResizeObserver(
    useCallback(() => {
      const element = controlRef.current;
      if (!element) return;
      setCompact(element.clientWidth < 760);
    }, []),
    useCallback(() => controlRef.current, [])
  );

  const { microphone, video, sound, screenshare, spotlight } = useCallControlState(
    callEmbed.control
  );

  const streamAudio = useScreenShareAudio();

  const handleSpotlightToggle = useCallback(() => callEmbed.control.toggleSpotlight(), [callEmbed]);
  const handleReactionsClick = useCallback(() => callEmbed.control.toggleReactions(), [callEmbed]);
  const handleSettingsClick = useCallback(() => callEmbed.control.toggleSettings(), [callEmbed]);

  const handleMicrophoneToggle = useCallback(
    () => callEmbed.control.toggleMicrophone(),
    [callEmbed]
  );
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
      {screenshare && streamAudio.error && (
        <Text size="T200" role="status">Bildschirm wird ohne Ton geteilt: {streamAudio.error}</Text>
      )}
      {screenshare && streamAudio.active && streamAudio.enabled && (
        <Text size="T200">Systemton wird geteilt; Diddys eigener Ton ist ausgenommen.</Text>
      )}
      <Box
        className={css.ControlCard}
        gap="200"
        alignItems="Center"
        justifyContent="Center"
        wrap="Wrap"
      >
        <div className={css.ControlGroup} style={{ flexWrap: 'nowrap' }}>
          <MicrophoneButton enabled={microphone} onToggle={handleMicrophoneToggle} />
          <DeviceChevron kind="input" size="bar" />
        </div>
        <div className={css.ControlGroup} style={{ flexWrap: 'nowrap' }}>
          <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
          <DeviceChevron kind="output" size="bar" />
        </div>
        <div className={css.ControlGroup}>
          <VideoButton enabled={video} onToggle={handleVideoToggle} />
          <ScreenShareButton
            enabled={screenshare}
            onToggle={() => callEmbed.control.toggleScreenshare()}
          />
          {streamAudio.available && (
            <ScreenShareAudioButton enabled={streamAudio.enabled} onToggle={streamAudio.toggle} />
          )}
        </div>
        {!compact && <ControlDivider />}
        <div className={css.ControlGroup}>
          <ChatButton />
          <SoundboardButton />
          <SpotlightButton active={spotlight} onToggle={handleSpotlightToggle} />
          <ReactionsButton onClick={handleReactionsClick} />
          <CallSettingsButton onClick={handleSettingsClick} />
        </div>
        {!compact && <ControlDivider />}
        <Button
          className={css.ControlPrimaryButton}
          style={compact ? { flexGrow: 1 } : undefined}
          variant="Critical"
          fill="Solid"
          onClick={hangup}
          before={
            exiting ? (
              <Spinner variant="Critical" fill="Solid" size="200" />
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
