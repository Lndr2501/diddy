import React, { useCallback, useRef, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text } from 'folds';
import * as css from './styles.css';
import { SoundboardButton } from './Soundboard';
import { WatchTogetherButton } from './WatchTogether';
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
import { controlCompanion, endCompanion, useCompanion } from '../../plugins/call/companion';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { CompanionDialog } from './CompanionDialog';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../../hooks/useAsyncCallback';

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
  const mx = useMatrixClient();
  const companion = useCompanion();
  const [companionOpen, setCompanionOpen] = useState(false);
  // While the iPhone sends microphone/camera, these buttons work the iPhone (CompanionSync.tsx).
  const phone = companion.phase === 'connected' ? companion.phone : undefined;
  const phoneMic = !!phone && !!companion.wanted?.microphone;
  const phoneCamera = !!phone && !!companion.wanted?.camera;

  const handleSpotlightToggle = useCallback(() => callEmbed.control.toggleSpotlight(), [callEmbed]);
  const handleReactionsClick = useCallback(() => callEmbed.control.toggleReactions(), [callEmbed]);
  const handleSettingsClick = useCallback(() => callEmbed.control.toggleSettings(), [callEmbed]);

  const handleMicrophoneToggle = useCallback(
    () =>
      phoneMic
        ? controlCompanion(mx, { microphone: !phone?.microphone })
        : callEmbed.control.toggleMicrophone(),
    [callEmbed, mx, phoneMic, phone?.microphone]
  );
  const handleVideoToggle = useCallback(
    () =>
      phoneCamera
        ? controlCompanion(mx, { camera: !phone?.camera })
        : callEmbed.control.toggleVideo(),
    [callEmbed, mx, phoneCamera, phone?.camera]
  );

  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  const toggleScreenshare = useCallback(() => callEmbed.control.toggleScreenshare(), [callEmbed]);

  // one short line above the bar instead of loose text next to it
  let status: { kind: 'warning' | 'info'; text: string } | undefined;
  if (companion.phase === 'waiting') {
    status = { kind: 'info', text: 'Waiting for your iPhone…' };
  } else if (screenshare && streamAudio.error) {
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
      {phone && (
        <div className={css.ControlToast} data-kind="info" role="status">
          <Icon size="100" src={Icons.Phone} />
          <Text size="T200" truncate>
            {`iPhone: ${
              [phone.camera && 'camera', phone.microphone && 'microphone', phone.screen && 'screen']
                .filter(Boolean)
                .join(', ') || 'connected'
            }`}
          </Text>
          <button type="button" className={css.ToastAction} onClick={() => endCompanion(mx)}>
            <Text as="span" size="T200">
              Disconnect
            </Text>
          </button>
        </div>
      )}
      {companionOpen && (
        <CompanionDialog callEmbed={callEmbed} onClose={() => setCompanionOpen(false)} />
      )}
      <div className={css.ControlCard} data-compact={compact || undefined}>
        <div className={css.ControlSplit}>
          <MicrophoneButton
            enabled={phoneMic ? !!phone?.microphone : microphone}
            onToggle={handleMicrophoneToggle}
          />
          <DeviceChevron kind="input" size="bar" className={css.ControlChevron} />
        </div>
        <div className={css.ControlSplit}>
          <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
          <DeviceChevron kind="output" size="bar" className={css.ControlChevron} />
        </div>
        <div className={css.ControlSplit}>
          <VideoButton
            enabled={phoneCamera ? !!phone?.camera : video}
            onToggle={handleVideoToggle}
          />
          <DeviceChevron kind="camera" size="bar" className={css.ControlChevron} />
        </div>
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
        <WatchTogetherButton />
        <ChatButton />
        <MoreButton
          spotlight={spotlight}
          onToggleSpotlight={handleSpotlightToggle}
          onSettings={handleSettingsClick}
          onPhone={() => setCompanionOpen(true)}
        />
        {!compact && <ControlDivider />}
        <Button
          className={css.ControlLeaveButton}
          variant="Critical"
          fill="Solid"
          onClick={ignoreRejection(hangup)}
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
