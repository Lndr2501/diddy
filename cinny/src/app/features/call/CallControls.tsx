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
  PhoneButton,
  ReactionsButton,
  ScreenShareButton,
  ShareOptionsButton,
  SoundButton,
  VideoButton,
} from './Controls';
import {
  CallEmbed,
  shareAudioOption,
  useCallControlState,
  useScreenShareAudio,
} from '../../plugins/call';
import {
  controlCompanion,
  dismissCompanion,
  endCompanion,
  useCompanion,
} from '../../plugins/call/companion';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { CompanionDialog } from './CompanionDialog';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { AsyncStatus, useAsyncCallback, ignoreRejection } from '../../hooks/useAsyncCallback';
import { useTranslation } from 'react-i18next';
import { usePushToTalkPrefs, usePushToTalkState } from '../../state/pushToTalk';
import { formatHotkey } from '../../plugins/agentVoice/hotkey';
import { isMacOS } from '../../utils/user-agent';

type CallControlsProps = {
  callEmbed: CallEmbed;
};
export function CallControls({ callEmbed }: CallControlsProps) {
  const { t } = useTranslation();
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
  let phoneState: 'idle' | 'waiting' | 'connected' = 'idle';
  if (phone) phoneState = 'connected';
  else if (companion.phase === 'waiting') phoneState = 'waiting';

  const pttState = usePushToTalkState();
  const pttPrefs = usePushToTalkPrefs();
  const ptt = pttState.active
    ? {
        open: pttState.open,
        keyLabel: pttPrefs.hotkey ? formatHotkey(pttPrefs.hotkey, isMacOS()) : undefined,
        fullMuted: pttState.heldWhileFullMuted,
      }
    : undefined;

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
    status = { kind: 'info', text: t('call.controls.waitingForYourIphone') };
  } else if (screenshare && streamAudio.error) {
    status = {
      kind: 'warning',
      text: t('call.controls.sharingWithoutSoundError', { error: streamAudio.error }),
    };
  } else if (screenshare && streamAudio.active && streamAudio.enabled) {
    status = { kind: 'info', text: t('call.controls.sharingYourSystemSound') };
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
      {companion.phase === 'ended' && (
        <div
          className={css.ControlToast}
          data-kind={companion.endReason === 'lost' ? 'warning' : 'info'}
          role="status"
        >
          <Icon size="100" src={companion.endReason === 'lost' ? Icons.Warning : Icons.Phone} />
          <Text size="T200" truncate>
            {companion.endReason === 'lost'
              ? t('call.controls.lostYourIphoneUsing')
              : t('call.controls.yourIphoneLeftUsing')}
          </Text>
          <button type="button" className={css.ToastAction} onClick={dismissCompanion}>
            <Text as="span" size="T200">
              {t('call.controls.ok')}
            </Text>
          </button>
        </div>
      )}
      {phone && (
        <div
          className={css.ControlToast}
          data-kind={companion.phoneBackground && phone.camera ? 'warning' : 'info'}
          role="status"
        >
          <Icon
            size="100"
            src={companion.phoneBackground && phone.camera ? Icons.Warning : Icons.Phone}
          />
          <Text size="T200" truncate>
            {companion.phoneBackground && phone.camera
              ? t('call.controls.iphoneCameraPausedOpen')
              : t('call.controls.iphoneUses', {
                  parts:
                    [
                      phone.camera && t('call.controls.iphoneCamera'),
                      phone.microphone && t('call.controls.iphoneMicrophone'),
                      phone.screen && t('call.controls.iphoneScreen'),
                    ]
                      .filter(Boolean)
                      .join(', ') || t('call.controls.iphoneConnected'),
                })}
          </Text>
          <button type="button" className={css.ToastAction} onClick={() => endCompanion(mx)}>
            <Text as="span" size="T200">
              {t('call.controls.disconnect')}
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
            phone={phoneMic}
            ptt={ptt}
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
            phone={phoneCamera}
          />
          <DeviceChevron kind="camera" size="bar" className={css.ControlChevron} />
        </div>
        {screenshare ? (
          <div className={css.ControlSplit} data-active>
            <ScreenShareButton enabled onToggle={toggleScreenshare} />
            <ShareOptionsButton
              audio={shareAudioOption(streamAudio)}
              onStop={toggleScreenshare}
            />
          </div>
        ) : (
          <ScreenShareButton enabled={false} onToggle={toggleScreenshare} />
        )}
        <PhoneButton state={phoneState} onClick={() => setCompanionOpen(true)} />
        {!compact && <ControlDivider />}
        <ReactionsButton onClick={handleReactionsClick} />
        <SoundboardButton />
        <WatchTogetherButton />
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
          onClick={ignoreRejection(hangup)}
          aria-label={t('call.controls.leaveCall')}
          before={
            exiting ? (
              <Spinner variant="Critical" fill="Solid" size="200" />
            ) : (
              <Icon src={Icons.PhoneDown} size="200" filled />
            )
          }
          disabled={exiting}
        >
          {!compact && <Text size="B400">{t('call.controls.leave')}</Text>}
        </Button>
      </div>
    </Box>
  );
}
