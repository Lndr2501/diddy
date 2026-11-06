import React, { useState } from 'react';
import { Icon, IconButton, Icons } from 'folds';
import { useVoiceRecorder, VoiceRecording } from '../../hooks/useVoiceRecorder';
import { millisecondsToMinutesAndSeconds } from '../../utils/common';
import { ArrowUpGlyph, TrashGlyph } from '../../components/message/content/VoiceIcons';
import * as css from '../../components/message/content/VoiceContent.css';

type VoiceRecorderButtonProps = {
  /** sends the finished recording; may reject, the recording is then kept by the caller */
  onRecorded: (recording: VoiceRecording) => Promise<void>;
  disabled?: boolean;
};

/**
 * Microphone button of the composer. While recording it turns into a small capsule (discard,
 * pulsing red dot, time, send) and the send button sends the message right away.
 */
export function VoiceRecorderButton({ onRecorded, disabled }: VoiceRecorderButtonProps) {
  const { state, elapsedMs, error, start, stop, cancel } = useVoiceRecorder();
  const [sending, setSending] = useState(false);

  if ((state === 'idle' || state === 'starting') && !sending) {
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

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      const recording = await stop();
      if (recording) await onRecorded(recording);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={css.Recorder} role="group" aria-label="Recording voice message">
      <button
        type="button"
        className={css.RoundButton}
        onClick={cancel}
        disabled={sending}
        aria-label="Discard recording"
        title="Discard"
      >
        <TrashGlyph />
      </button>
      <span className={css.RecordDot} aria-hidden />
      <span className={css.RecordTime} aria-live="off">
        {millisecondsToMinutesAndSeconds(elapsedMs)}
      </span>
      <button
        type="button"
        className={css.SendButton}
        onClick={() => handleSend()}
        disabled={sending}
        aria-label="Send voice message"
        title="Send"
      >
        {sending ? <span className={css.Spinner} aria-hidden /> : <ArrowUpGlyph />}
      </button>
    </div>
  );
}
