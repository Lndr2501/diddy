/**
 * Where animated (GIF / WebP) Diddy profile pictures actually move. Local to this device, kept in
 * localStorage. Switched off, a place shows the user's normal Matrix picture (or initials).
 */
import { useSyncExternalStore } from 'react';

export type AvatarSurface = 'profile' | 'chat' | 'members' | 'account' | 'call';

export type AvatarPrefs = Record<AvatarSurface, boolean> & {
  /** the picture only moves while its owner is speaking in the call you are in */
  speakingOnly: boolean;
};

const KEY = 'diddyAvatarAnimation';
const DEFAULTS: AvatarPrefs = {
  profile: true,
  chat: true,
  members: true,
  account: true,
  call: true,
  speakingOnly: true,
};

const read = (): AvatarPrefs => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AvatarPrefs>;
    const next = { ...DEFAULTS };
    (Object.keys(DEFAULTS) as (keyof AvatarPrefs)[]).forEach((surface) => {
      if (typeof stored[surface] === 'boolean') next[surface] = stored[surface] as boolean;
    });
    return next;
  } catch {
    return DEFAULTS;
  }
};

let current = read();
const listeners = new Set<() => void>();

export const getAvatarPrefs = (): AvatarPrefs => current;

export const setAvatarAnimation = (surface: keyof AvatarPrefs, animated: boolean) => {
  current = { ...current, [surface]: animated };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
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

export const useAvatarPrefs = (): AvatarPrefs => useSyncExternalStore(subscribe, getAvatarPrefs);
