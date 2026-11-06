import React from 'react';
import { Box, Icon, IconButton, Icons, Text } from 'folds';
import { useVoiceRecorder, VoiceRecording } from '../../hooks/useVoiceRecorder';
import { millisecondsToMinutesAndSeconds } from '../../utils/common';
import { VOICE_MAX_MS } from '../../plugins/voiceMessage';

type VoiceRecorderButtonProps = {
  /** receives the finished recording; it is put into the upload board like any file */
  onRecorded: (recording: VoiceRecording) => void;
  disabled?: boolean;
};

/** Microphone button of the message composer; while recording it shows timer, cancel and done. */
export function VoiceRecorderButton({ onRecorded, disabled }: VoiceRecorderButtonProps) {
  const { state, elapsedMs, error, start, stop, cancel } = useVoiceRecorder();

  if (state === 'idle' || state === 'starting') {
    return (
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="Pill"
        disabled={disabled || state === 'starting'}
        onClick={() => start()}
        aria-label="Record voice message"
        title={error ?? 'Record voice message'}
      >
        <Icon src={Icons.Mic} />
      </IconButton>
    );
  }

  const handleDone = async () => {
    const recording = await stop();
    if (recording) onRecorded(recording);
  };

  return (
    <Box alignItems="Center" gap="100" role="status" aria-label="Recording voice message">
      <IconButton
        variant="SurfaceVariant"
        fill="None"
        size="300"
        radii="Pill"
        onClick={cancel}
        aria-label="Discard recording"
      >
        <Icon src={Icons.Cross} />
      </IconButton>
      <Box alignItems="Center" gap="100" style={{ minWidth: '6.5em' }}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5484d' }}
        />
        <Text size="T300" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {millisecondsToMinutesAndSeconds(elapsedMs)} /{' '}
          {millisecondsToMinutesAndSeconds(VOICE_MAX_MS)}
        </Text>
      </Box>
      <IconButton
        variant="Primary"
        size="300"
        radii="Pill"
        onClick={() => handleDone()}
        aria-label="Finish recording"
      >
        <Icon src={Icons.Check} />
      </IconButton>
    </Box>
  );
}
