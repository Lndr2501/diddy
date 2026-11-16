// MyInstants sounds of the soundboard, kept in the account data so every device of yours has
// the same ones (#248).
//
// Only the MyInstants path and the clip name are stored (no audio, no own files): every device
// downloads a missing sound from MyInstants itself. Your own audio files stay on the device.
// Removals leave a short-lived marker, so a merge does not bring a removed sound back; per sound
// the newer of "added" and "removed" wins (like saved messages). iOS has the same rules in
// ios/Diddy/Call/SoundboardSync.swift.

export const SOUNDBOARD_SYNC_TYPE = 'app.diddy.soundboard';

/** At most this many synced sounds (well under the 64 KB account data limit). */
export const SOUNDBOARD_SYNC_LIMIT = 200;
/** Removal markers older than this are dropped. */
export const SOUNDBOARD_REMOVED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** At most this many removal markers, the newest. */
export const SOUNDBOARD_REMOVED_LIMIT = 100;
/** Clip names are cut to this length, like the soundboard does. */
const NAME_MAX = 40;

export type SyncedSound = { path: string; name: string; added_ts: number };
export type RemovedSound = { path: string; removed_ts: number };
export type SoundboardSyncState = { sounds: SyncedSound[]; removed: RemovedSound[] };
export type SoundboardSyncContent = SoundboardSyncState & { version: 1 };

export const emptySoundboardSync = (): SoundboardSyncState => ({ sounds: [], removed: [] });

/** A MyInstants sound file path, the only thing the sync may make a device download. */
export const isMyInstantsPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 300 &&
  /^\/media\/sounds\/[^?#\\]+$/.test(value) &&
  !value.includes('..');

const cleanName = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';

const isTs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

type Entry = { path: string; name?: string; addedTs?: number; removedTs?: number };

const collect = (into: Map<string, Entry>, raw: unknown): void => {
  if (!raw || typeof raw !== 'object') return;
  const { sounds, removed } = raw as { sounds?: unknown; removed?: unknown };
  if (Array.isArray(sounds)) {
    sounds.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const { path, name, added_ts: ts } = item as Record<string, unknown>;
      const clean = cleanName(name);
      if (!isMyInstantsPath(path) || !clean || !isTs(ts)) return;
      const entry = into.get(path) ?? { path };
      if (ts > (entry.addedTs ?? -1)) {
        entry.addedTs = ts;
        entry.name = clean;
      }
      into.set(path, entry);
    });
  }
  if (Array.isArray(removed)) {
    removed.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const { path, removed_ts: ts } = item as Record<string, unknown>;
      if (!isMyInstantsPath(path) || !isTs(ts)) return;
      const entry = into.get(path) ?? { path };
      entry.removedTs = Math.max(entry.removedTs ?? -1, ts);
      into.set(path, entry);
    });
  }
};

const newestFirst = (a: { ts: number; path: string }, b: { ts: number; path: string }) => {
  if (b.ts !== a.ts) return b.ts - a.ts;
  if (a.path === b.path) return 0;
  return a.path < b.path ? -1 : 1;
};

const build = (entries: Map<string, Entry>, now: number): SoundboardSyncState => {
  const sounds: SyncedSound[] = [];
  const removed: RemovedSound[] = [];
  entries.forEach((entry) => {
    const addedTs = entry.addedTs ?? -1;
    const removedTs = entry.removedTs ?? -1;
    if (addedTs > removedTs && entry.name) {
      sounds.push({ path: entry.path, name: entry.name, added_ts: addedTs });
    } else if (removedTs >= 0 && now - removedTs <= SOUNDBOARD_REMOVED_KEEP_MS) {
      removed.push({ path: entry.path, removed_ts: removedTs });
    }
  });
  sounds.sort((a, b) => newestFirst({ ts: a.added_ts, path: a.path }, { ts: b.added_ts, path: b.path }));
  removed.sort((a, b) =>
    newestFirst({ ts: a.removed_ts, path: a.path }, { ts: b.removed_ts, path: b.path })
  );
  return {
    sounds: sounds.slice(0, SOUNDBOARD_SYNC_LIMIT),
    removed: removed.slice(0, SOUNDBOARD_REMOVED_LIMIT),
  };
};

/** Reads stored content; anything malformed is skipped. */
export const parseSoundboardSync = (raw: unknown, now: number): SoundboardSyncState => {
  const entries = new Map<string, Entry>();
  collect(entries, raw);
  return build(entries, now);
};

/** Both lists together: per sound the newer of added and removed wins. */
export const mergeSoundboardSync = (a: unknown, b: unknown, now: number): SoundboardSyncState => {
  const entries = new Map<string, Entry>();
  collect(entries, a);
  collect(entries, b);
  return build(entries, now);
};

export const toSoundboardSyncContent = (state: SoundboardSyncState): SoundboardSyncContent => ({
  version: 1,
  sounds: state.sounds,
  removed: state.removed,
});

/** Adds sounds (newer than an earlier removal even with a clock behind the other device's). */
export const addSyncedSounds = (
  state: SoundboardSyncState,
  items: { path: string; name: string }[],
  now: number
): SoundboardSyncState => {
  const fresh = items.filter(
    (item) => isMyInstantsPath(item.path) && !state.sounds.some((s) => s.path === item.path)
  );
  if (fresh.length === 0) return state;
  const room = SOUNDBOARD_SYNC_LIMIT - state.sounds.length;
  if (room <= 0) return state;
  const sounds = fresh.slice(0, room).map((item) => {
    const marker = state.removed.find((r) => r.path === item.path);
    return {
      path: item.path,
      name: cleanName(item.name) || 'sound',
      added_ts: Math.max(now, (marker?.removed_ts ?? -1) + 1),
    };
  });
  return mergeSoundboardSync(state, { sounds }, now);
};

/** Removes a sound everywhere: a marker newer than its entry. */
export const removeSyncedSound = (
  state: SoundboardSyncState,
  path: string,
  now: number
): SoundboardSyncState => {
  const current = state.sounds.find((s) => s.path === path);
  if (!current) return state;
  return mergeSoundboardSync(
    state,
    { removed: [{ path, removed_ts: Math.max(now, current.added_ts + 1) }] },
    now
  );
};

export const sameSoundboardSync = (a: SoundboardSyncState, b: SoundboardSyncState): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Whether a read after writing shows that another device's write crossed ours. */
export const soundboardSyncNeedsRewrite = (
  after: unknown,
  written: SoundboardSyncState,
  now: number
): boolean =>
  !sameSoundboardSync(mergeSoundboardSync(after, written, now), parseSoundboardSync(after, now));

export type LocalClip = { id: string; name: string; myinstants?: string };

export type SoundboardSyncPlan = {
  /** Synced sounds this device does not have yet: download them from MyInstants. */
  download: { path: string; name: string }[];
  /** Clips removed on another device. */
  remove: string[];
  /** Clips imported before the sync (no path stored) that match a synced sound by name. */
  link: { id: string; path: string }[];
  /** MyInstants clips of this device that the account does not know yet. */
  publish: { path: string; name: string }[];
};

/** What this device has to do so that its soundboard matches the account. */
export const planSoundboardSync = (
  state: SoundboardSyncState,
  clips: LocalClip[]
): SoundboardSyncPlan => {
  const plan: SoundboardSyncPlan = { download: [], remove: [], link: [], publish: [] };
  const byPath = new Map<string, LocalClip>();
  clips.forEach((clip) => {
    if (clip.myinstants) byPath.set(clip.myinstants, clip);
  });
  const linked = new Set<string>();
  state.sounds.forEach((sound) => {
    if (byPath.has(sound.path)) return;
    const wanted = sound.name.toLowerCase();
    const sameName = clips.find(
      (clip) => !clip.myinstants && !linked.has(clip.id) && clip.name.toLowerCase() === wanted
    );
    if (sameName) {
      linked.add(sameName.id);
      plan.link.push({ id: sameName.id, path: sound.path });
    } else {
      plan.download.push({ path: sound.path, name: sound.name });
    }
  });
  const removedPaths = new Set(state.removed.map((r) => r.path));
  const syncedPaths = new Set(state.sounds.map((s) => s.path));
  clips.forEach((clip) => {
    const path = clip.myinstants;
    if (!path) return;
    if (removedPaths.has(path)) plan.remove.push(clip.id);
    else if (!syncedPaths.has(path)) plan.publish.push({ path, name: clip.name });
  });
  return plan;
};
