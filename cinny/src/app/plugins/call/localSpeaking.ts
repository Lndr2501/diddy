/**
 * Whether you are talking in the call right now (#76), measured on the microphone track Diddy hands
 * to Element Call (after the soundboard mixer, so it is exactly what the others hear). A track that
 * Element Call mutes is disabled and reads as silence, so muting ends the ring by itself.
 *
 * Installed as a wrapper around the call iframe's getUserMedia(), after the soundboard's wrapper.
 */
import { useSyncExternalStore } from 'react';
import { getSharedAudioContext } from './sharedAudio';
import { createVoiceActivity, levelDb, SILENCE_DB } from './voiceActivity';

const POLL_MS = 60;

let speaking = false;
const listeners = new Set<() => void>();

const setSpeaking = (next: boolean) => {
  if (next === speaking) return;
  speaking = next;
  listeners.forEach((l) => l());
};

export const isLocalSpeaking = (): boolean => speaking;

export const subscribeLocalSpeaking = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useLocalSpeaking = (): boolean =>
  useSyncExternalStore(subscribeLocalSpeaking, isLocalSpeaking);

let stopWatch: (() => void) | undefined;
/** The call window whose microphone is measured. */
let watchedWindow: Window | undefined;

/**
 * Stop measuring (the call ended). With `win`, only when that call's microphone is the one
 * measured: a call you switch to may already have started before the old one is disposed.
 */
export const stopLocalSpeaking = (win?: Window | null): void => {
  if (win !== undefined && win !== watchedWindow) return;
  stopWatch?.();
  stopWatch = undefined;
  watchedWindow = undefined;
  setSpeaking(false);
};

/** Measure `track` from now on (replaces the microphone measured until now). */
export const watchLocalMicrophone = (track: MediaStreamTrack, win?: Window): void => {
  stopLocalSpeaking();
  watchedWindow = win;
  let ctx: AudioContext;
  let source: MediaStreamAudioSourceNode;
  let analyser: AnalyserNode;
  try {
    ctx = getSharedAudioContext();
    source = ctx.createMediaStreamSource(new MediaStream([track]));
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    // not connected onwards: an analyser is pulled on its own and nothing becomes audible
    source.connect(analyser);
  } catch {
    return;
  }
  const samples = new Float32Array(analyser.fftSize);
  const activity = createVoiceActivity();
  const timer = window.setInterval(() => {
    if (track.readyState === 'ended') {
      // only the current watch has a running timer: a replaced one was stopped
      stopLocalSpeaking();
      return;
    }
    let db = SILENCE_DB;
    if (track.enabled && !track.muted) {
      analyser.getFloatTimeDomainData(samples);
      db = levelDb(samples);
    }
    setSpeaking(activity.update(db, performance.now()));
  }, POLL_MS);
  stopWatch = () => {
    window.clearInterval(timer);
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      // already disconnected
    }
  };
};

/** Wraps getUserMedia() of the call iframe so its microphone is measured. Safe to call repeatedly. */
export const installLocalSpeaking = (win: Window | null | undefined): void => {
  if (!win) return;
  const devices = win.navigator?.mediaDevices as
    | (MediaDevices & { __diddyLocalSpeaking?: boolean })
    | undefined;
  if (!devices || typeof devices.getUserMedia !== 'function' || devices.__diddyLocalSpeaking) {
    return;
  }
  const original = devices.getUserMedia.bind(devices);
  devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const stream = await original(constraints);
    const [track] = stream.getAudioTracks();
    if (track) watchLocalMicrophone(track, win);
    return stream;
  };
  devices.__diddyLocalSpeaking = true;
};
