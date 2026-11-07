/**
 * The user's plugin list (#54), local to this device and kept in localStorage. Every storage
 * access is guarded: without storage the list simply lives until the app is closed.
 * The rules themselves live in plugins/userPlugins.ts.
 */
import { useSyncExternalStore } from 'react';
import {
  addPlugin,
  PluginInput,
  parseStoredPlugins,
  removePlugin,
  Result,
  serializePlugins,
  setPluginEnabled,
  UserPlugin,
} from '../plugins/userPlugins';

const KEY = 'diddyPlugins';

const appOrigin = (): string | undefined => {
  try {
    return window.location.origin;
  } catch {
    return undefined;
  }
};

const read = (): UserPlugin[] => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return parseStoredPlugins(JSON.parse(raw), appOrigin());
  } catch {
    return [];
  }
};

let current: UserPlugin[] = read();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const commit = (next: UserPlugin[]) => {
  current = next;
  try {
    localStorage.setItem(KEY, serializePlugins(next));
  } catch {
    // storage unavailable: the list lasts until the app is closed
  }
  notify();
};

// keep other windows of the app (e.g. extra connections) in sync
try {
  window.addEventListener('storage', (evt) => {
    if (evt.key !== KEY) return;
    current = read();
    notify();
  });
} catch {
  // no window events (tests, workers)
}

const newId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getUserPlugins = (): UserPlugin[] => current;

export const addUserPlugin = (input: PluginInput): Result<UserPlugin[]> => {
  const result = addPlugin(current, input, {
    id: newId(),
    now: Date.now(),
    appOrigin: appOrigin(),
  });
  if (result.ok) commit(result.value);
  return result;
};

export const setUserPluginEnabled = (id: string, enabled: boolean) => {
  commit(setPluginEnabled(current, id, enabled));
};

export const removeUserPlugin = (id: string) => {
  commit(removePlugin(current, id));
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useUserPlugins = (): UserPlugin[] => useSyncExternalStore(subscribe, getUserPlugins);
