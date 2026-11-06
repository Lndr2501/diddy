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
};

const KEY = 'diddyCallPrefs';
const DEFAULTS: Prefs = { echoCancellation: false, callSounds: true };

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

export const updateCallPrefs = (patch: Partial<Prefs>) => {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
};

export const useCallPrefs = (): Prefs =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current
  );
