import { useCallback, useEffect, useRef, useState } from 'react';
import {
  baseMime,
  extensionForMime,
  pickRecorderMime,
  VOICE_MAX_MS,
  VOICE_MIN_MS,
  VoiceMeta,
  waveformFromLevels,
} from '../plugins/voiceMessage';
import { nativeMicAvailable, openNativeMic, preferredNativeMic } from '../plugins/call/nativeMic';

/**
 * The microphone for a recording: natively in the desktop app (no voice processing, so other apps'
 * audio is not ducked), otherwise WebKit's microphone without processing.
 */
const openMicrophone = async (): Promise<MediaStream> => {
  if (nativeMicAvailable()) {
    try {
      const track = await openNativeMic(
        await preferredNativeMic(navigator.mediaDevices, undefined)
      );
      return new MediaStream([track]);
    } catch {
      // fall back to WebKit below
    }
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
};

export type VoiceRecording = VoiceMeta & { file: File };
export type VoiceRecorderState = 'idle' | 'starting' | 'recording';

const LEVEL_INTERVAL_MS = 100;

/** Records the microphone for a voice message (MediaRecorder + a loudness meter for the waveform). */
export const useVoiceRecorder = () => {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string>();

  // A ref also guards two starts before React has rendered the starting state.
  const active = useRef(false);
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder>();
  const stream = useRef<MediaStream>();
  const audioContext = useRef<AudioContext>();
  const chunks = useRef<Blob[]>([]);
  const levels = useRef<number[]>([]);
  const timer = useRef<number>();
  const startedAt = useRef(0);
  const stopResult = useRef<Promise<VoiceRecording | undefined>>();
  const finish = useRef<(recording: VoiceRecording | undefined) => void>();

  const release = useCallback((updateState = true) => {
    generation.current += 1;
    active.current = false;
    const rec = recorder.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      if (rec.state !== 'inactive') rec.stop();
    }
    finish.current?.(undefined);
    finish.current = undefined;
    stopResult.current = undefined;
    window.clearInterval(timer.current);
    timer.current = undefined;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
    audioContext.current?.close().catch(() => undefined);
    audioContext.current = undefined;
    recorder.current = undefined;
    chunks.current = [];
    levels.current = [];
    if (updateState) {
      setElapsedMs(0);
      setState('idle');
    }
  }, []);

  const start = useCallback(async () => {
    if (active.current) return;
    setError(undefined);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice messages are not supported here.');
      return;
    }
    active.current = true;
    generation.current += 1;
    const request = generation.current;
    setState('starting');
    try {
      const media = await openMicrophone();
      // Permission can resolve after cancellation or a room switch/unmount.
      if (request !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      const rec = mime ? new MediaRecorder(media, { mimeType: mime }) : new MediaRecorder(media);
      recorder.current = rec;
      chunks.current = [];
      levels.current = [];

      const ctx = new AudioContext();
      audioContext.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(media).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);

      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      rec.onerror = () => {
        release();
        setError('The recording failed. Please try again.');
      };
      rec.onstop = () => {
        const durationMs = Date.now() - startedAt.current;
        const type = baseMime(rec.mimeType || mime || 'audio/webm');
        const blob = new Blob(chunks.current, { type });
        const waveform = waveformFromLevels(levels.current);
        const done = finish.current;
        finish.current = undefined;
        release();
        if (!done) {
          setError(
            durationMs >= VOICE_MAX_MS
              ? 'Recording reached the 15-minute limit and was not saved. Please record a shorter message.'
              : 'Recording ended unexpectedly and was not saved. Please try again.'
          );
          return;
        }
        if (durationMs < VOICE_MIN_MS || blob.size === 0) {
          done(undefined);
          return;
        }
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        const file = new File([blob], `Voice message ${stamp}.${extensionForMime(type)}`, { type });
        done({ file, durationMs, waveform });
      };

      startedAt.current = Date.now();
      rec.start(1000);
      setState('recording');
      timer.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        let peak = 0;
        for (let i = 0; i < samples.length; i += 1)
          peak = Math.max(peak, Math.abs(samples[i] - 128));
        levels.current.push(peak / 128);
        const elapsed = Date.now() - startedAt.current;
        setElapsedMs(elapsed);
        if (elapsed >= VOICE_MAX_MS && rec.state === 'recording') rec.stop();
      }, LEVEL_INTERVAL_MS);
    } catch (e) {
      if (request !== generation.current) return;
      release();
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone access was denied.'
          : 'Could not start the recording.'
      );
    }
  }, [release]);

  /** Stops and returns the recording (undefined when it was too short). */
  const stop = useCallback(() => {
    if (stopResult.current) return stopResult.current;
    const rec = recorder.current;
    if (!rec || rec.state === 'inactive') return Promise.resolve(undefined);
    const result = new Promise<VoiceRecording | undefined>((resolve) => {
      finish.current = resolve;
    });
    stopResult.current = result;
    rec.stop();
    return result;
  }, []);

  const cancel = useCallback(() => release(), [release]);

  useEffect(() => () => release(false), [release]);

  return { state, elapsedMs, error, start, stop, cancel };
};
