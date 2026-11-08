/**
 * Watch together (#83): preferences (local to this device) and the shared video of the call you
 * are in. The Matrix transport is plugged in by WatchTogetherSync; the player panel reads and
 * changes the shared state through here.
 */
import { useSyncExternalStore } from 'react';
import { isNewer, nextChange, SharedWatch, startWatch } from '../plugins/watchTogether/protocol';
import {
  DEFAULT_CATEGORIES,
  isSponsorCategory,
  SponsorCategory,
} from '../plugins/watchTogether/sponsorBlock';
import { QUALITY_CHOICES, QualityChoice } from '../plugins/watchTogether/youtube';
import type { SharedPatch } from '../plugins/watchTogether/controller';

// --- preferences -------------------------------------------------------------------------------

export type WatchPrefs = {
  enabled: boolean;
  categories: SponsorCategory[];
  /** 0..100, your own volume of the player */
  volume: number;
  muted: boolean;
  /** asked of YouTube; it may pick another quality */
  quality: QualityChoice;
};

const PREFS_KEY = 'diddyWatchTogether';
const DEFAULT_PREFS: WatchPrefs = {
  enabled: true,
  categories: DEFAULT_CATEGORIES,
  volume: 80,
  muted: false,
  quality: 'auto',
};

const readPrefs = (): WatchPrefs => {
  try {
    const s = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>;
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_PREFS.enabled,
      categories: Array.isArray(s.categories)
        ? [...new Set(s.categories.filter(isSponsorCategory))]
        : DEFAULT_PREFS.categories,
      volume:
        typeof s.volume === 'number' && Number.isFinite(s.volume)
          ? Math.min(100, Math.max(0, Math.round(s.volume)))
          : DEFAULT_PREFS.volume,
      muted: typeof s.muted === 'boolean' ? s.muted : DEFAULT_PREFS.muted,
      quality: (QUALITY_CHOICES as readonly unknown[]).includes(s.quality)
        ? (s.quality as QualityChoice)
        : DEFAULT_PREFS.quality,
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

let prefs = readPrefs();
const prefListeners = new Set<() => void>();

export const getWatchPrefs = (): WatchPrefs => prefs;

export const updateWatchPrefs = (patch: Partial<WatchPrefs>): void => {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: the choice lasts until the app is closed
  }
  prefListeners.forEach((l) => l());
};

const subscribePrefs = (listener: () => void) => {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
};

export const useWatchPrefs = (): WatchPrefs => useSyncExternalStore(subscribePrefs, getWatchPrefs);

// --- the shared video ----------------------------------------------------------------------------

export type WatchTransport = {
  roomId: string;
  userId: string;
  send: (shared: SharedWatch) => void;
};

export type WatchToast = { id: number; text: string };

export type WatchSnapshot = {
  /** the transport is there: you are in a call and the feature is on */
  available: boolean;
  shared?: SharedWatch;
  /** the session you closed for yourself (it keeps running for the others) */
  closedSession?: string;
  toast?: WatchToast;
};

let snapshot: WatchSnapshot = { available: false };
let transport: WatchTransport | undefined;
const listeners = new Set<() => void>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;

const set = (patch: Partial<WatchSnapshot>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
};

export const getWatch = (): WatchSnapshot => snapshot;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useWatch = (): WatchSnapshot => useSyncExternalStore(subscribe, getWatch);

export const showWatchToast = (text: string): void => {
  toastId += 1;
  set({ toast: { id: toastId, text } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: undefined }), 4000);
};

/** Plugged in while you are in a call (undefined: left the call, everything is forgotten). */
export const setWatchTransport = (next: WatchTransport | undefined): void => {
  transport = next;
  if (!next) {
    if (toastTimer) clearTimeout(toastTimer);
    snapshot = { available: false };
    listeners.forEach((l) => l());
    return;
  }
  set({ available: true });
};

/** A state from another call member; returns true when it replaced ours. */
export const receiveWatch = (shared: SharedWatch): boolean => {
  if (!isNewer(shared, snapshot.shared)) return false;
  set({ shared });
  return true;
};

const publish = (shared: SharedWatch) => {
  set({ shared });
  transport?.send(shared);
};

export const startWatching = (videoId: string, start: number): void => {
  if (!transport) return;
  publish(startWatch(videoId, start, snapshot.shared, transport.userId, Date.now()));
  set({ closedSession: undefined });
};

/** A change you made in the player (play, pause, seek, speed, skip). */
export const changeWatch = (patch: SharedPatch): void => {
  const { shared } = snapshot;
  if (!transport || !shared || shared.state === 'stopped') return;
  publish(nextChange(shared, patch, transport.userId, Date.now()));
};

export const stopWatchingForEveryone = (): void => {
  const { shared } = snapshot;
  if (!transport || !shared || shared.state === 'stopped') return;
  publish(nextChange(shared, { state: 'stopped' }, transport.userId, Date.now()));
};

export const closeWatchForMe = (): void => {
  if (snapshot.shared) set({ closedSession: snapshot.shared.session });
};

export const reopenWatch = (): void => set({ closedSession: undefined });
