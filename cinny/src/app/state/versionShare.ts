/**
 * Whether your profile tells other Diddy users which Diddy version you run (#75). On by default,
 * stored on this device; switching it off removes the version from your profile.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'diddyShareVersion';

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
};

let share = read();
const listeners = new Set<() => void>();

export const getShareVersion = (): boolean => share;

export const setShareVersion = (value: boolean): void => {
  share = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // storage unavailable: the choice lasts until the app is closed
  }
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useShareVersion = (): boolean => useSyncExternalStore(subscribe, getShareVersion);
