import React, { useCallback, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import * as css from './styles.css';
import { SoundboardButton } from './Soundboard';
import { DeviceChevron } from './DevicePicker';
import {
  ChatButton,
  ControlDivider,
  MicrophoneButton,
  MoreButton,
  ReactionsButton,
  ScreenShareButton,
  ShareOptionsButton,
  SoundButton,
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

  const toggleScreenshare = useCallback(() => callEmbed.control.toggleScreenshare(), [callEmbed]);

  // one short line above the bar instead of loose text next to it
  let status: { kind: 'warning' | 'info'; text: string } | undefined;
  if (screenshare && streamAudio.error) {
    status = { kind: 'warning', text: `Sharing without sound: ${streamAudio.error}` };
  } else if (screenshare && streamAudio.active && streamAudio.enabled) {
    status = { kind: 'info', text: 'Sharing your system sound (without Diddy itself)' };
  }

  return (
    <Box
      ref={controlRef}
      className={css.CallControlContainer}
      direction="Column"
      alignItems="Center"
      gap="200"
    >
      {status && (
        <div className={css.ControlToast} data-kind={status.kind} role="status">
          <Icon size="100" src={status.kind === 'warning' ? Icons.Warning : Icons.Info} />
          <Text size="T200" truncate>
            {status.text}
          </Text>
        </div>
      )}
      <div className={css.ControlCard} data-compact={compact || undefined}>
        <div className={css.ControlSplit}>
          <MicrophoneButton enabled={microphone} onToggle={handleMicrophoneToggle} />
          <DeviceChevron kind="input" size="bar" className={css.ControlChevron} />
        </div>
        <div className={css.ControlSplit}>
          <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
          <DeviceChevron kind="output" size="bar" className={css.ControlChevron} />
        </div>
        <VideoButton enabled={video} onToggle={handleVideoToggle} />
        {screenshare ? (
          <div className={css.ControlSplit} data-active>
            <ScreenShareButton enabled onToggle={toggleScreenshare} />
            <ShareOptionsButton
              audio={
                streamAudio.available
                  ? { enabled: streamAudio.enabled, onToggle: streamAudio.toggle }
                  : null
              }
              onStop={toggleScreenshare}
            />
          </div>
        ) : (
          <ScreenShareButton enabled={false} onToggle={toggleScreenshare} />
        )}
        {!compact && <ControlDivider />}
        <ReactionsButton onClick={handleReactionsClick} />
        <SoundboardButton />
        <ChatButton />
        <MoreButton
          spotlight={spotlight}
          onToggleSpotlight={handleSpotlightToggle}
          onSettings={handleSettingsClick}
        />
        {!compact && <ControlDivider />}
        <Button
          className={css.ControlLeaveButton}
          variant="Critical"
          fill="Solid"
          onClick={hangup}
          aria-label="Leave call"
          before={
            exiting ? (
              <Spinner variant="Critical" fill="Solid" size="200" />
            ) : (
              <Icon src={Icons.PhoneDown} size="200" filled />
            )
          }
          disabled={exiting}
        >
          {!compact && <Text size="B400">Leave</Text>}
        </Button>
      </div>
    </Box>
  );
}
