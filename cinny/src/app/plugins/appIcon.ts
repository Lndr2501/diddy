/**
 * Desktop app icon switching. The Tauri shell exposes the `set_app_icon` command; in a plain
 * browser there is no shell and everything here is a no-op.
 */
import { useSyncExternalStore } from 'react';
import { canInvoke, invoke } from './tauri';

export type AppIconId = 'pink' | 'blue' | 'purple' | 'black' | 'magenta';

export const DEFAULT_APP_ICON: AppIconId = 'pink';
export const APP_ICON_IDS: AppIconId[] = ['pink', 'blue', 'purple', 'black', 'magenta'];

const STORAGE_KEY = 'appIcon';
const CHANGE_EVENT = 'diddy-app-icon-change';

export const canChangeAppIcon = (): boolean => canInvoke();

export const getAppIcon = (): AppIconId => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return APP_ICON_IDS.includes(stored as AppIconId) ? (stored as AppIconId) : DEFAULT_APP_ICON;
};

export const setAppIcon = async (id: AppIconId): Promise<void> => {
  // The Dock/taskbar icon only changes inside the desktop app, the in-app logos change everywhere.
  if (canInvoke()) await invoke('set_app_icon', { id });
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** The chosen app icon, re-renders when it changes. */
export const useAppIcon = (): AppIconId => useSyncExternalStore(subscribe, getAppIcon);

/** The bundle icon is the default one, so only a non-default choice needs applying at start. */
export const applyStoredAppIcon = () => {
  const id = getAppIcon();
  if (id === DEFAULT_APP_ICON || !canChangeAppIcon()) return;
  setAppIcon(id).catch(() => {});
};
