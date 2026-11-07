/**
 * Key/value data of plugins. A sandboxed plugin has no storage of its own, so it asks the app to
 * keep a few small values for it (`diddy:storage:get` / `diddy:storage:set`). Each plugin only ever
 * sees its own data. Local to this device, kept in localStorage, every access guarded.
 */
import { applyStorageSet, isValidStorageKey } from '../plugins/userPlugins';

const prefix = 'diddyPluginData:';

const memory = new Map<string, Record<string, string>>();

const readAll = (pluginId: string): Record<string, string> => {
  const cached = memory.get(pluginId);
  if (cached) return cached;
  let data: Record<string, string> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(prefix + pluginId) ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.entries(parsed as Record<string, unknown>).forEach(([k, v]) => {
        if (typeof v === 'string' && isValidStorageKey(k)) data[k] = v;
      });
    }
  } catch {
    data = {};
  }
  memory.set(pluginId, data);
  return data;
};

export const getPluginData = (pluginId: string, key: string): string | null =>
  readAll(pluginId)[key] ?? null;

export const setPluginData = (pluginId: string, key: string, value: string): boolean => {
  const result = applyStorageSet(readAll(pluginId), key, value);
  if (!result.ok) return false;
  memory.set(pluginId, result.value);
  try {
    localStorage.setItem(prefix + pluginId, JSON.stringify(result.value));
  } catch {
    // storage unavailable: the value lasts until the app is closed
  }
  return true;
};

/** Removes everything a plugin stored (used when the plugin is removed). */
export const clearPluginData = (pluginId: string) => {
  memory.delete(pluginId);
  try {
    localStorage.removeItem(prefix + pluginId);
  } catch {
    // ignore
  }
};
