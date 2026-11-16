/** Small call preferences kept in localStorage (read outside of React too). */
import { useSyncExternalStore } from 'react';

type Prefs = {
  /**
   * "Voice processing": echo cancellation, noise suppression and auto gain of the microphone.
   * Off by default: on macOS, WebKit then switches to the system voice mode, which ducks and
   * changes all other audio (music). Turn it on when you use speakers instead of headphones.
   * (Kept under the old key name so saved settings still work.)
   */
  echoCancellation: boolean;
  /** Short tones when you mute / unmute / deafen / undeafen. */
  callSounds: boolean;
  /**
   * Removes background noise from the microphone with RNNoise (open source), inside Diddy. Unlike
   * "Voice processing" it does not switch macOS to its system voice mode.
   */
  noiseSuppression: boolean;
  /**
   * "Automatic mic volume": the browser's automatic gain, also while "Voice processing" is off.
   * Windows and Linux (Chromium): on by default, many microphones are very quiet without it.
   * macOS: off and not offered; the microphone is taken natively there, and WebKit's gain would
   * bring back the system voice mode.
   */
  autoGain: boolean;
};

const KEY = 'diddyCallPrefs';

/** Automatic gain is offered where Chromium captures the microphone (Windows, Linux). */
export const autoGainSupported = (): boolean =>
  typeof navigator !== 'undefined' && !/Macintosh|Mac OS X|iPhone|iPad/.test(navigator.userAgent);

const DEFAULTS: Prefs = {
  echoCancellation: false,
  callSounds: true,
  noiseSuppression: true,
  autoGain: autoGainSupported(),
};

const read = (): Prefs => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
};

let current = read();
const listeners = new Set<() => void>();

export const getCallPrefs = (): Prefs => current;

/** Whether the microphone gets automatic gain while "Voice processing" is off. */
export const micAutoGain = (): boolean => autoGainSupported() && current.autoGain;

export const updateCallPrefs = (patch: Partial<Prefs>) => {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => current;

export const useCallPrefs = (): Prefs => useSyncExternalStore(subscribe, getSnapshot);
