/* eslint-disable jsx-a11y/media-has-caption */
import React, { MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { IAudioInfo } from '../../../../types/matrix/common';
import {
  PlayTimeCallback,
  useMediaLoading,
  useMediaPlay,
  useMediaPlayTimeCallback,
  useMediaSeek,
} from '../../../hooks/media';
import { useThrottle } from '../../../hooks/useThrottle';
import { secondsToMinutesAndSeconds } from '../../../utils/common';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { VoiceInfo, waveformBars } from '../../../plugins/voiceMessage';
import { PauseGlyph, PlayGlyph } from './VoiceIcons';
import * as css from './VoiceContent.css';

const BAR_COUNT = 40;
const PLAY_TIME_THROTTLE_OPS = { wait: 100, immediate: true };

export type VoiceContentProps = {
  mimeType: string;
  url: string;
  info: IAudioInfo;
  voice: VoiceInfo;
  encInfo?: EncryptedAttachmentInfo;
};

/** Voice message: play button, clickable waveform, time. Loads the audio on the first play. */
export function VoiceContent({ mimeType, url, info, voice, encInfo }: VoiceContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [srcState, loadSrc] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      return URL.createObjectURL(fileContent);
    }, [mx, url, useAuthentication, mimeType, encInfo])
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const getAudioRef = useCallback(() => audioRef.current, []);
  const knownDuration = (voice.durationMs ?? info.duration ?? 0) / 1000;
  const [duration, setDuration] = useState(knownDuration > 0 ? knownDuration : 0);
  const [currentTime, setCurrentTime] = useState(0);
  const { loading } = useMediaLoading(getAudioRef);
  const { playing, setPlaying } = useMediaPlay(getAudioRef);
  const { seek } = useMediaSeek(getAudioRef);
  const handlePlayTime: PlayTimeCallback = useCallback((d, ct) => {
    if (Number.isFinite(d) && d > 0) setDuration(d);
    setCurrentTime(ct);
  }, []);
  useMediaPlayTimeCallback(getAudioRef, useThrottle(handlePlayTime, PLAY_TIME_THROTTLE_OPS));

  const bars = useMemo(() => waveformBars(voice.waveform, BAR_COUNT), [voice.waveform]);
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const ready = srcState.status === AsyncStatus.Success;
  const busy = srcState.status === AsyncStatus.Loading || (ready && loading);

  const handlePlay = () => {
    if (ready) setPlaying(!playing);
    else if (srcState.status !== AsyncStatus.Loading) loadSrc();
  };
  const handleSeek = (event: MouseEvent<HTMLButtonElement>) => {
    if (!ready || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - rect.left) / Math.max(rect.width, 1)) * duration);
  };

  // remaining time while playing (like Messages), total length otherwise
  const shown = playing || currentTime > 0 ? Math.max(duration - currentTime, 0) : duration;

  let glyph = <PlayGlyph />;
  if (busy) glyph = <span className={css.Spinner} aria-hidden />;
  else if (playing) glyph = <PauseGlyph />;

  return (
    <div className={css.Voice}>
      <button
        type="button"
        className={css.PlayButton}
        onClick={handlePlay}
        disabled={srcState.status === AsyncStatus.Loading}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {glyph}
      </button>
      <button
        type="button"
        className={css.Wave}
        onClick={handleSeek}
        disabled={!ready}
        aria-label="Voice message position"
      >
        {bars.map((height, index) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={`${css.Bar} ${(index + 0.5) / bars.length <= progress ? css.BarPlayed : ''}`}
            style={{ height: `${Math.round(height * 100)}%` }}
          />
        ))}
      </button>
      {srcState.status === AsyncStatus.Error ? (
        <span className={css.Error} role="alert">
          Failed
        </span>
      ) : (
        <span className={css.Time}>{secondsToMinutesAndSeconds(shown)}</span>
      )}
      <audio controls={false} autoPlay ref={audioRef}>
        {ready && <source src={srcState.data} type={mimeType} />}
      </audio>
    </div>
  );
}
