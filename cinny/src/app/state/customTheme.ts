/**
 * Settings of the "Custom" theme: colors, gradient and a background image / GIF / video.
 * The settings live in localStorage, the (possibly large) background file in IndexedDB.
 */
import { useSyncExternalStore } from 'react';
import { deleteBlob, getBlob, putBlob } from '../utils/blobStore';

export type CustomThemeConfig = {
  accent: string;
  background: string;
  text: string;
  gradient: boolean;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  /** Kind of the stored background file. GIFs are images. */
  mediaKind?: 'image' | 'video';
  mediaName?: string;
  mediaSound: boolean;
  /** 0..1 */
  mediaVolume: number;
  /** How opaque panels are over a gradient / media background, 0.3..1 */
  surfaceOpacity: number;
};

export const DEFAULT_CUSTOM_THEME: CustomThemeConfig = {
  accent: '#FF4FA3',
  background: '#0E0E12',
  text: '#F2F2F5',
  gradient: false,
  gradientFrom: '#1B0B2E',
  gradientTo: '#0B1F3A',
  gradientAngle: 135,
  mediaSound: false,
  mediaVolume: 0.5,
  surfaceOpacity: 0.8,
};

const CONFIG_KEY = 'customTheme';
const MEDIA_KEY = 'background';

const readConfig = (): CustomThemeConfig => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return { ...DEFAULT_CUSTOM_THEME, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_CUSTOM_THEME;
  }
};

let current = readConfig();
const listeners = new Set<() => void>();

const publish = (next: CustomThemeConfig) => {
  current = next;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const updateCustomTheme = (patch: Partial<CustomThemeConfig>) =>
  publish({ ...current, ...patch });

export const useCustomTheme = (): CustomThemeConfig =>
  useSyncExternalStore(subscribe, () => current);

// --- background file (IndexedDB) ---------------------------------------------------------------

export const setBackgroundMedia = async (file: File) => {
  if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
    throw new Error('Choose an image, GIF or video file.');
  }
  await putBlob(MEDIA_KEY, file);
  updateCustomTheme({
    mediaKind: file.type.startsWith('video/') ? 'video' : 'image',
    mediaName: file.name,
  });
};

export const removeBackgroundMedia = async () => {
  await deleteBlob(MEDIA_KEY);
  updateCustomTheme({ mediaKind: undefined, mediaName: undefined });
};

export const loadBackgroundMedia = (): Promise<Blob | undefined> => getBlob(MEDIA_KEY);
