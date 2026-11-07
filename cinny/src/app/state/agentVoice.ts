/**
 * "Talking to an agent" (#57): preferences (local to this device, off by default) and who is
 * talking to an agent right now (you, and the others in your call who told you so).
 */
import { useSyncExternalStore } from 'react';
import { AgentHotkey, AgentHotkeyMode, parseHotkey } from '../plugins/agentVoice/hotkey';

export type AgentVoicePrefs = {
  enabled: boolean;
  hotkey?: AgentHotkey;
  mode: AgentHotkeyMode;
  /** mute the call microphone while talking to the agent */
  muteMic: boolean;
  /** tell the others in the call (they see "Talking to agent" on your picture) */
  share: boolean;
};

const KEY = 'diddyAgentVoice';
const DEFAULTS: AgentVoicePrefs = { enabled: false, mode: 'hold', muteMic: true, share: true };

const read = (): AgentVoicePrefs => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return {
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULTS.enabled,
      hotkey: parseHotkey(stored.hotkey),
      mode: stored.mode === 'toggle' ? 'toggle' : 'hold',
      muteMic: typeof stored.muteMic === 'boolean' ? stored.muteMic : DEFAULTS.muteMic,
      share: typeof stored.share === 'boolean' ? stored.share : DEFAULTS.share,
    };
  } catch {
    return DEFAULTS;
  }
};

let prefs = read();
const prefListeners = new Set<() => void>();

export const getAgentVoicePrefs = (): AgentVoicePrefs => prefs;

export const updateAgentVoicePrefs = (patch: Partial<AgentVoicePrefs>): void => {
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

export const useAgentVoicePrefs = (): AgentVoicePrefs =>
  useSyncExternalStore(subscribePrefs, getAgentVoicePrefs);

// --- who talks to an agent -------------------------------------------------------------------

let ownActive = false;
let remote: ReadonlySet<string> = new Set();
const talkListeners = new Set<() => void>();
const notifyTalk = () => talkListeners.forEach((l) => l());

export const setOwnAgentTalking = (active: boolean): void => {
  if (ownActive === active) return;
  ownActive = active;
  notifyTalk();
};

export const setRemoteAgentTalking = (userIds: Iterable<string>): void => {
  const next = new Set(userIds);
  if (next.size === remote.size && [...next].every((id) => remote.has(id))) return;
  remote = next;
  notifyTalk();
};

const subscribeTalk = (listener: () => void) => {
  talkListeners.add(listener);
  return () => {
    talkListeners.delete(listener);
  };
};

/** You are talking to an agent right now. */
export const useOwnAgentTalking = (): boolean =>
  useSyncExternalStore(subscribeTalk, () => ownActive);

/** `userId` talks to an agent (for your own id: you do). */
export const useAgentTalking = (userId: string, ownUserId?: string): boolean =>
  useSyncExternalStore(subscribeTalk, () =>
    userId === ownUserId ? ownActive : remote.has(userId)
  );
