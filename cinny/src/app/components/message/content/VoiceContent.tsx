/* eslint-disable jsx-a11y/media-has-caption */
import React, { MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, Icons, Spinner, Text } from 'folds';
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
import * as css from './VoiceContent.css';

const BAR_COUNT = 48;
const PLAY_TIME_THROTTLE_OPS = { wait: 200, immediate: true };

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

  const handlePlay = () => {
    if (srcState.status === AsyncStatus.Success) setPlaying(!playing);
    else if (srcState.status !== AsyncStatus.Loading) loadSrc();
  };
  const handleSeek = (event: MouseEvent<HTMLButtonElement>) => {
    if (srcState.status !== AsyncStatus.Success || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    seek(((event.clientX - rect.left) / Math.max(rect.width, 1)) * duration);
  };

  const busy = srcState.status === AsyncStatus.Loading || loading;
  return (
    <div className={css.Voice}>
      <IconButton
        variant="Primary"
        size="400"
        radii="Pill"
        onClick={handlePlay}
        disabled={srcState.status === AsyncStatus.Loading}
        aria-label={playing ? 'Pause' : 'Play voice message'}
      >
        {busy ? (
          <Spinner variant="Primary" size="200" />
        ) : (
          <Icon src={playing ? Icons.Pause : Icons.Play} size="200" filled />
        )}
      </IconButton>
      <button
        type="button"
        className={css.Wave}
        onClick={handleSeek}
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
      <Text size="T200" className={css.Time}>
        {secondsToMinutesAndSeconds(playing || currentTime > 0 ? currentTime : duration)}
      </Text>
      {srcState.status === AsyncStatus.Error && (
        <Text size="T200" role="alert">
          Could not load
        </Text>
      )}
      <audio controls={false} autoPlay ref={audioRef}>
        {srcState.status === AsyncStatus.Success && <source src={srcState.data} type={mimeType} />}
      </audio>
    </div>
  );
}
