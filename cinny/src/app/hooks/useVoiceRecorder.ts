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

export type VoiceRecording = VoiceMeta & { file: File };
export type VoiceRecorderState = 'idle' | 'starting' | 'recording';

const LEVEL_INTERVAL_MS = 100;

/** Records the microphone for a voice message (MediaRecorder + a loudness meter for the waveform). */
export const useVoiceRecorder = () => {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string>();

  const recorder = useRef<MediaRecorder>();
  const stream = useRef<MediaStream>();
  const audioContext = useRef<AudioContext>();
  const chunks = useRef<Blob[]>([]);
  const levels = useRef<number[]>([]);
  const timer = useRef<number>();
  const startedAt = useRef(0);
  const finish = useRef<(recording: VoiceRecording | undefined) => void>();

  const release = useCallback(() => {
    window.clearInterval(timer.current);
    timer.current = undefined;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
    audioContext.current?.close().catch(() => undefined);
    audioContext.current = undefined;
    recorder.current = undefined;
    chunks.current = [];
    levels.current = [];
    setElapsedMs(0);
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (recorder.current || state !== 'idle') return;
    setError(undefined);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice messages are not supported here.');
      return;
    }
    setState('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      rec.onstop = () => {
        const durationMs = Date.now() - startedAt.current;
        const type = baseMime(rec.mimeType || mime || 'audio/webm');
        const blob = new Blob(chunks.current, { type });
        const waveform = waveformFromLevels(levels.current);
        const done = finish.current;
        finish.current = undefined;
        release();
        if (!done) return;
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
      release();
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Microphone access was denied.'
          : 'Could not start the recording.'
      );
    }
  }, [state, release]);

  /** Stops and returns the recording (undefined when it was too short). */
  const stop = useCallback(
    () =>
      new Promise<VoiceRecording | undefined>((resolve) => {
        const rec = recorder.current;
        if (!rec || rec.state === 'inactive') {
          resolve(undefined);
          return;
        }
        finish.current = resolve;
        rec.stop();
      }),
    []
  );

  const cancel = useCallback(() => {
    const rec = recorder.current;
    finish.current = undefined;
    if (rec && rec.state !== 'inactive') rec.stop();
    else release();
  }, [release]);

  useEffect(
    () => () => {
      finish.current = undefined;
      const rec = recorder.current;
      if (rec && rec.state !== 'inactive') rec.stop();
      window.clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
      audioContext.current?.close().catch(() => undefined);
    },
    []
  );

  return { state, elapsedMs, error, start, stop, cancel };
};
