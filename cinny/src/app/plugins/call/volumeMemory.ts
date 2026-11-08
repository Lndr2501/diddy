/**
 * Volumes you gave other people in calls, remembered per person (Matrix user id) on this device.
 *
 * Element Call starts everybody (and every screen share) at 100 % and forgets what you set as
 * soon as that person or you leave the call. Diddy keeps the level here and gives it back the
 * next time that person shows up (see userVolume.ts for voices, shareVolume.ts for screen shares).
 *
 * Stored in localStorage as { "@user:server": { volume, muted } }, one key per kind of sound.
 * 100 % and not muted is the default and is never stored. The object keeps the order of use
 * (the last used person last), so when more than MAX_REMEMBERED people are stored the ones not
 * heard from for the longest time are dropped.
 */

export type RememberedVolume = {
  /** the level the slider stands at, also while muted (unmute returns to it); 0 < volume <= 1 */
  volume: number;
  muted: boolean;
};

export type KeyValueStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

/** Screen-share sound of a person. */
export const STREAM_VOLUMES_KEY = 'diddyStreamVolumes';
/** Voice (microphone) of a person. */
export const USER_VOLUMES_KEY = 'diddyUserVolumes';

/** At most this many people are remembered per kind; the least recently used go first. */
export const MAX_REMEMBERED = 500;

/** A usable level: 0 < level <= 1 (Element Call's slider goes from 0 to 1 in 0.01 steps). */
export const validLevel = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(1, Math.max(0.01, Math.round(n * 100) / 100));
};

/** Everything remembered under `key`, oldest use first; broken or foreign entries are left out. */
export const readVolumes = (
  storage: KeyValueStore | undefined,
  key: string
): Record<string, RememberedVolume> => {
  try {
    const raw = JSON.parse(storage?.getItem(key) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const result: Record<string, RememberedVolume> = {};
    Object.entries(raw as Record<string, Partial<RememberedVolume>>).forEach(([userId, entry]) => {
      const volume = validLevel(entry?.volume);
      if (userId.startsWith('@') && volume !== undefined) {
        result[userId] = { volume, muted: entry?.muted === true };
      }
    });
    return result;
  } catch {
    return {};
  }
};

const write = (
  storage: KeyValueStore,
  key: string,
  all: Record<string, RememberedVolume>
): void => {
  try {
    if (Object.keys(all).length === 0 && storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(all));
  } catch {
    // storage full or blocked: the volume still applies for now, it is just not remembered
  }
};

/** The volume remembered for `userId` under `key`, if any. */
export const rememberedVolume = (
  storage: KeyValueStore | undefined,
  key: string,
  userId: string
): RememberedVolume | undefined => readVolumes(storage, key)[userId];

/**
 * Remember `entry` for `userId` (the default, 100 % and not muted, removes the entry). The
 * person becomes the most recently used one; beyond `max` people the oldest are dropped.
 */
export const rememberVolume = (
  storage: KeyValueStore | undefined,
  key: string,
  userId: string,
  entry: RememberedVolume,
  max = MAX_REMEMBERED
): void => {
  if (!storage || !userId || !userId.startsWith('@')) return;
  const all = readVolumes(storage, key);
  const volume = validLevel(entry.volume) ?? 1;
  const muted = entry.muted === true;
  const before = all[userId];
  if (volume === 1 && !muted) {
    if (!before) return;
    delete all[userId];
  } else {
    // moved to the end: the most recently used
    delete all[userId];
    all[userId] = { volume, muted };
    const ids = Object.keys(all);
    ids.slice(0, Math.max(0, ids.length - Math.max(1, max))).forEach((id) => delete all[id]);
  }
  write(storage, key, all);
};

/** `userId` was just met again: their entry becomes the most recently used one. */
export const touchVolume = (
  storage: KeyValueStore | undefined,
  key: string,
  userId: string
): void => {
  if (!storage) return;
  const all = readVolumes(storage, key);
  const entry = all[userId];
  const ids = Object.keys(all);
  if (!entry || ids[ids.length - 1] === userId) return;
  delete all[userId];
  all[userId] = entry;
  write(storage, key, all);
};

/** Forget every remembered volume under `key`. */
export const clearVolumes = (storage: KeyValueStore | undefined, key: string): void => {
  if (!storage) return;
  try {
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, '{}');
  } catch {
    // blocked storage: nothing was remembered either
  }
};

/** Forget the volumes of all people, voices and screen shares (Settings > General > Calls). */
export const clearAllCallVolumes = (storage: KeyValueStore | undefined): void => {
  clearVolumes(storage, USER_VOLUMES_KEY);
  clearVolumes(storage, STREAM_VOLUMES_KEY);
};

/** window.localStorage, or undefined where it is blocked. */
export const browserStorage = (): KeyValueStore | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
