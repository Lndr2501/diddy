/**
 * GIF search settings (#82): local to this device, kept in localStorage, off by default.
 * Each provider has its own API key; keys are the user's own and never leave the device except
 * in requests to that provider.
 */
import { useSyncExternalStore } from 'react';
import { GIF_PROVIDER_IDS, GIF_RATINGS, GifProviderId, GifRating } from '../plugins/gifSearch';

export type GifPrefs = {
  enabled: boolean;
  provider: GifProviderId;
  rating: GifRating;
  keys: Record<GifProviderId, string>;
  /** anonymous random id, sent to KLIPY as customer_id (asked for per user) */
  customerId?: string;
};

export const GIF_PREFS_KEY = 'diddyGifs';
export const DEFAULT_GIF_PREFS: GifPrefs = {
  enabled: false,
  provider: 'giphy',
  rating: 'g',
  keys: { giphy: '', klipy: '' },
};

const cleanKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, 128) : '';

/** Stored JSON to prefs; anything missing or malformed falls back to the defaults. */
export const parseGifPrefs = (raw: string | null): GifPrefs => {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch {
    // fall back to the defaults
  }
  const keys =
    stored.keys && typeof stored.keys === 'object' ? (stored.keys as Record<string, unknown>) : {};
  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : DEFAULT_GIF_PREFS.enabled,
    provider: GIF_PROVIDER_IDS.includes(stored.provider as GifProviderId)
      ? (stored.provider as GifProviderId)
      : DEFAULT_GIF_PREFS.provider,
    rating: GIF_RATINGS.includes(stored.rating as GifRating)
      ? (stored.rating as GifRating)
      : DEFAULT_GIF_PREFS.rating,
    keys: { giphy: cleanKey(keys.giphy), klipy: cleanKey(keys.klipy) },
    customerId:
      typeof stored.customerId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(stored.customerId)
        ? stored.customerId
        : undefined,
  };
};

/** Key of the active provider, if GIFs are switched on and a key is set. */
export const activeGifKey = (prefs: GifPrefs): string | undefined =>
  prefs.enabled ? prefs.keys[prefs.provider] || undefined : undefined;

const randomId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

const read = (): GifPrefs => {
  try {
    return parseGifPrefs(localStorage.getItem(GIF_PREFS_KEY));
  } catch {
    return DEFAULT_GIF_PREFS;
  }
};

let prefs = read();
const listeners = new Set<() => void>();

const save = () => {
  try {
    localStorage.setItem(GIF_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable: the choice lasts until the app is closed
  }
};

export const getGifPrefs = (): GifPrefs => prefs;

export const updateGifPrefs = (patch: Partial<Omit<GifPrefs, 'keys'>>): void => {
  prefs = { ...prefs, ...patch };
  save();
  listeners.forEach((l) => l());
};

export const setGifApiKey = (provider: GifProviderId, key: string): void => {
  prefs = { ...prefs, keys: { ...prefs.keys, [provider]: cleanKey(key) } };
  save();
  listeners.forEach((l) => l());
};

/** Stable anonymous id for this device, created on first use. */
export const getGifCustomerId = (): string => {
  if (!prefs.customerId) {
    prefs = { ...prefs, customerId: randomId() };
    save();
    listeners.forEach((l) => l());
  }
  return prefs.customerId as string;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useGifPrefs = (): GifPrefs => useSyncExternalStore(subscribe, getGifPrefs);
