/* eslint-disable jsx-a11y/media-has-caption */
import React, {
  KeyboardEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { useAtom } from 'jotai';
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
import {
  keySeekTime,
  nextVoiceRate,
  seekFraction,
  VoiceInfo,
  voiceRateLabel,
  waveformBars,
} from '../../../plugins/voiceMessage';
import { voiceRateAtom } from '../../../state/voiceRate';
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

type GlowState = 'off' | 'on' | 'fading';

/** Play triangle that splits into the two pause bars. */
function PlayPauseMorph({ playing }: { playing: boolean }) {
  return (
    <span className={`${css.Morph} ${playing ? css.MorphPlaying : ''}`} aria-hidden>
      <span className={css.MorphLeft} />
      <span className={css.MorphRight} />
    </span>
  );
}

/**
 * Voice message: play button, waveform to drag over (or arrow keys when focused), time.
 * Loads the audio on the first play. While playing, lights circle the edge of the capsule.
 */
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

  // one speed for all voice messages (#204); loading a source resets playbackRate to the default
  const [rate, setRate] = useAtom(voiceRateAtom);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  }, [rate, srcState.status]);

  const bars = useMemo(() => waveformBars(voice.waveform, BAR_COUNT), [voice.waveform]);
  const ready = srcState.status === AsyncStatus.Success;
  const busy = srcState.status === AsyncStatus.Loading || (ready && loading);
  const canSeek = ready && duration > 0;

  // position while dragging, so the waveform follows the pointer without waiting for timeupdate
  const [scrub, setScrub] = useState<number | null>(null);
  const progress = scrub ?? (duration > 0 ? Math.min(currentTime / duration, 1) : 0);

  const [glow, setGlow] = useState<GlowState>('off');
  useEffect(() => {
    if (playing) {
      setGlow('on');
      return undefined;
    }
    setGlow((g) => (g === 'off' ? 'off' : 'fading'));
    const timer = window.setTimeout(() => setGlow('off'), css.GLOW_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [playing]);

  const handlePlay = () => {
    if (ready) setPlaying(!playing);
    else if (srcState.status !== AsyncStatus.Loading) loadSrc();
  };

  const seekToPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = seekFraction(event.clientX, rect.left, rect.width);
    setScrub(fraction);
    seek(fraction * duration);
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canSeek || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekToPointer(event);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (scrub === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    seekToPointer(event);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (scrub !== null) {
      setCurrentTime(scrub * duration);
      setScrub(null);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const next = keySeekTime(event.key, currentTime, duration);
    if (next === undefined) return;
    event.preventDefault();
    setCurrentTime(next);
    seek(next);
  };

  // remaining time while playing (like Messages), total length otherwise
  const position = scrub !== null ? scrub * duration : currentTime;
  const shown = playing || position > 0 ? Math.max(duration - position, 0) : duration;

  const glyph = busy ? (
    <span className={css.Spinner} aria-hidden />
  ) : (
    <PlayPauseMorph playing={playing} />
  );

  return (
    <div className={css.Voice}>
      {glow !== 'off' && (
        <span className={`${css.Glow} ${glow === 'fading' ? css.GlowFading : ''}`} aria-hidden>
          <span className={css.GlowOrbit} />
          <span className={css.GlowFace} />
        </span>
      )}
      <button
        type="button"
        className={css.PlayButton}
        onClick={handlePlay}
        disabled={srcState.status === AsyncStatus.Loading}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
      >
        {glyph}
      </button>
      <div
        className={css.Wave}
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Voice message position"
        aria-disabled={!canSeek}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={secondsToMinutesAndSeconds(position)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {bars.map((height, index) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={`${css.Bar} ${(index + 0.5) / bars.length <= progress ? css.BarPlayed : ''}`}
            style={{ height: `${Math.round(height * 100)}%` }}
          />
        ))}
      </div>
      {srcState.status === AsyncStatus.Error ? (
        <span className={css.Error} role="alert">
          Failed
        </span>
      ) : (
        <span className={css.Time}>{secondsToMinutesAndSeconds(shown)}</span>
      )}
      <button
        type="button"
        className={css.RateButton}
        onClick={() => setRate(nextVoiceRate(rate))}
        aria-label={`Playback speed ${voiceRateLabel(rate)}`}
        title="Playback speed"
      >
        {voiceRateLabel(rate)}
      </button>
      <audio controls={false} autoPlay ref={audioRef}>
        {ready && <source src={srcState.data} type={mimeType} />}
      </audio>
    </div>
  );
}
