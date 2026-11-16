/**
 * Push-to-talk: preferences (local to this device, voice activation by default), what the call
 * bar shows, and the hold of the microphone button. Logic: plugins/call/pushToTalk.ts, wiring:
 * components/PushToTalkSync.tsx.
 */
import { useSyncExternalStore } from 'react';
import { AgentHotkey, GlobalHotkeyInfo, parseHotkey } from '../plugins/agentVoice/hotkey';
import { clampReleaseDelay, DEFAULT_RELEASE_DELAY_MS, InputMode } from '../plugins/call/pushToTalk';

export type PushToTalkPrefs = {
  mode: InputMode;
  hotkey?: AgentHotkey;
  /** how long the microphone stays open after letting go, 0-500 ms */
  releaseDelayMs: number;
  /** Linux / Windows desktop app: also read the key while Diddy is in the background (during calls) */
  background: boolean;
};

const KEY = 'diddyPushToTalk';
const DEFAULTS: PushToTalkPrefs = {
  mode: 'voice',
  releaseDelayMs: DEFAULT_RELEASE_DELAY_MS,
  background: true,
};

const read = (): PushToTalkPrefs => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return {
      mode: stored.mode === 'ptt' ? 'ptt' : 'voice',
      hotkey: parseHotkey(stored.hotkey),
      releaseDelayMs:
        stored.releaseDelayMs === undefined
          ? DEFAULTS.releaseDelayMs
          : clampReleaseDelay(stored.releaseDelayMs),
      background: stored.background !== false,
    };
  } catch {
    return DEFAULTS;
  }
};

let prefs = read();
const prefListeners = new Set<() => void>();

export const getPushToTalkPrefs = (): PushToTalkPrefs => prefs;

/** Push-to-talk is the input mode: the microphone belongs to the push-to-talk key. */
export const isPushToTalkMode = (): boolean => prefs.mode === 'ptt';

export const updatePushToTalkPrefs = (patch: Partial<PushToTalkPrefs>): void => {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
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

export const usePushToTalkPrefs = (): PushToTalkPrefs =>
  useSyncExternalStore(subscribePrefs, getPushToTalkPrefs);

// --- what the microphone buttons show ---------------------------------------------------------

export type PushToTalkState = {
  /** push-to-talk runs for the current call */
  active: boolean;
  /** the microphone is open right now */
  open: boolean;
  /** the key or button is held while full mute keeps the microphone closed */
  heldWhileFullMuted: boolean;
};

const IDLE: PushToTalkState = { active: false, open: false, heldWhileFullMuted: false };
let pttState = IDLE;
const stateListeners = new Set<() => void>();

export const setPushToTalkState = (next: PushToTalkState): void => {
  if (
    next.active === pttState.active &&
    next.open === pttState.open &&
    next.heldWhileFullMuted === pttState.heldWhileFullMuted
  ) {
    return;
  }
  pttState = next.active ? next : IDLE;
  stateListeners.forEach((l) => l());
};

const subscribeState = (listener: () => void) => {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
};

export const usePushToTalkState = (): PushToTalkState =>
  useSyncExternalStore(subscribeState, () => pttState);

// --- holding the microphone button ------------------------------------------------------------

const buttonListeners = new Set<(down: boolean) => void>();

/** The microphone button is held (true) or let go (false). */
export const setPushToTalkButton = (down: boolean): void => {
  buttonListeners.forEach((l) => l(down));
};

export const onPushToTalkButton = (listener: (down: boolean) => void): (() => void) => {
  buttonListeners.add(listener);
  return () => {
    buttonListeners.delete(listener);
  };
};

// --- system-wide key of the Linux / Windows desktop app ---------------------------------------

let globalInfo: GlobalHotkeyInfo | undefined;
const globalListeners = new Set<() => void>();

export const setPushToTalkGlobalInfo = (info: GlobalHotkeyInfo | undefined): void => {
  globalInfo = info;
  globalListeners.forEach((l) => l());
};

const subscribeGlobal = (listener: () => void) => {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
};

/** How the desktop app reads the push-to-talk key system-wide (undefined: not bound right now). */
export const usePushToTalkGlobalInfo = (): GlobalHotkeyInfo | undefined =>
  useSyncExternalStore(subscribeGlobal, () => globalInfo);
