/**
 * Volume and "mute for me" of somebody else's screen share.
 *
 * Element Call has this control (a button on its spotlight tile), but it acts only on the share
 * the spotlight currently counts as visible, and with the Diddy stage on that button is not
 * shown at all. Every share has its own media view model in Element Call, though, and that model
 * holds the playback volume of the share's sound (LiveKit `setVolume` on the screen-share audio
 * track). Diddy reaches the model of exactly one share through the React props of its tile
 * (`[data-testid="videoTile"][data-id="…:screen-share"]`), so the volume stays Element Call's
 * own state: one value per share, kept while the share runs, the same as its own slider shows.
 *
 * Stable hooks used (checked against Element Call 0.20.1, see also callStage.ts):
 *   - the tile's React fiber (`__reactFiber$…`), whose owners get `vm` as a prop
 *   - vm.id === the tile's data-id, vm.type === "screen share", vm.local === false
 *   - vm.playbackVolume$ / vm.audioEnabled$: behaviours (`value` + `subscribe`)
 *   - vm.adjustPlaybackVolume(v), vm.commitPlaybackVolume(), vm.togglePlaybackMuted()
 * If any of that is missing after an Element Call update, the control is simply not offered.
 */

import {
  KeyValueStore,
  readVolumes,
  RememberedVolume,
  rememberedVolume,
  rememberVolume,
  STREAM_VOLUMES_KEY,
  touchVolume,
} from './volumeMemory';

type Subscription = { unsubscribe: () => void };
type Behavior<T> = { value: T; subscribe: (next: (value: T) => void) => Subscription };

export type ShareVolumeVm = {
  id: string;
  type: string;
  local: boolean;
  playbackVolume$: Behavior<number>;
  audioEnabled$: Behavior<boolean>;
  adjustPlaybackVolume: (volume: number) => void;
  commitPlaybackVolume: () => void;
  togglePlaybackMuted: () => void;
};

const isBehavior = (value: unknown): value is Behavior<unknown> =>
  !!value &&
  typeof (value as Behavior<unknown>).subscribe === 'function' &&
  'value' in (value as object);

/** True for the view model of a remote screen share that can change its volume. */
export const isShareVolumeVm = (vm: unknown): vm is ShareVolumeVm => {
  const m = vm as Partial<ShareVolumeVm> | null | undefined;
  return (
    !!m &&
    typeof m.id === 'string' &&
    m.type === 'screen share' &&
    m.local === false &&
    isBehavior(m.playbackVolume$) &&
    isBehavior(m.audioEnabled$) &&
    typeof m.adjustPlaybackVolume === 'function' &&
    typeof m.commitPlaybackVolume === 'function' &&
    typeof m.togglePlaybackMuted === 'function'
  );
};

type Fiber = { memoizedProps?: { vm?: unknown } | null; return?: Fiber | null };

/** How far up from the tile's element the owner with the `vm` prop may be. */
const MAX_DEPTH = 30;

/** The view model of the share whose tile is `tile` (its data-id must be the model's id). */
export const shareVmOfTile = (tile: object | null | undefined): ShareVolumeVm | undefined => {
  if (!tile) return undefined;
  const key = Object.keys(tile).find((k) => k.startsWith('__reactFiber$'));
  let fiber = key ? ((tile as Record<string, unknown>)[key] as Fiber | undefined) : undefined;
  const id = (tile as { getAttribute?: (name: string) => string | null }).getAttribute?.('data-id');
  for (let depth = 0; fiber && depth < MAX_DEPTH; depth += 1) {
    const vm = fiber.memoizedProps?.vm;
    if (isShareVolumeVm(vm) && vm.id === id) return vm;
    fiber = fiber.return ?? undefined;
  }
  return undefined;
};

type TileDoc = {
  querySelectorAll: (selector: string) => ArrayLike<{ getAttribute: (n: string) => string | null }>;
};

/** The view model of the screen share `shareId` (Element Call's data-id) in the call document. */
export const findShareVolumeVm = (
  doc: TileDoc | null | undefined,
  shareId: string | undefined
): ShareVolumeVm | undefined => {
  if (!doc || !shareId) return undefined;
  const tile = Array.from(doc.querySelectorAll('[data-testid="videoTile"][data-id]')).find(
    (t) => t.getAttribute('data-id') === shareId
  );
  return shareVmOfTile(tile);
};

export type ShareVolumeState = {
  /** the share sends sound (otherwise there is nothing to turn down) */
  hasAudio: boolean;
  /** 0 … 1; 0 is "muted for me" */
  volume: number;
};

export const readShareVolume = (vm: ShareVolumeVm): ShareVolumeState => ({
  hasAudio: !!vm.audioEnabled$.value,
  volume: Math.min(1, Math.max(0, Number(vm.playbackVolume$.value) || 0)),
});

/** Calls `onChange` whenever the volume or the sound of the share changes. */
export const watchShareVolume = (vm: ShareVolumeVm, onChange: () => void): (() => void) => {
  const subs = [vm.playbackVolume$.subscribe(onChange), vm.audioEnabled$.subscribe(onChange)];
  return () => subs.forEach((sub) => sub.unsubscribe());
};

/*
 * Remembered per person: the volume you gave somebody's screen share comes back the next time
 * they share (Element Call starts every share at 100 %). Kept in localStorage under
 * `diddyStreamVolumes` (see volumeMemory.ts); 100 % and not muted is the default and is not stored.
 */

export type { RememberedVolume } from './volumeMemory';
export { STREAM_VOLUMES_KEY } from './volumeMemory';

/** Everything remembered; broken or foreign entries are left out. */
export const readStreamVolumes = (
  storage: KeyValueStore | undefined
): Record<string, RememberedVolume> => readVolumes(storage, STREAM_VOLUMES_KEY);

/** The remembered volume of `userId`'s screen shares, if any. */
export const rememberedStreamVolume = (
  storage: KeyValueStore | undefined,
  userId: string
): RememberedVolume | undefined => rememberedVolume(storage, STREAM_VOLUMES_KEY, userId);

/** Remember `entry` for `userId` (the default, 100 % and not muted, removes the entry). */
export const rememberStreamVolume = (
  storage: KeyValueStore | undefined,
  userId: string,
  entry: RememberedVolume
): void => rememberVolume(storage, STREAM_VOLUMES_KEY, userId, entry);

/** Share models whose remembered volume was already applied (once per share, never again). */
const restored = new WeakSet<object>();

/**
 * Give a share that just started the volume remembered for its owner. Only once per share, so
 * it never overrides what you change while the share runs.
 */
export const restoreStreamVolume = (
  vm: ShareVolumeVm,
  userId: string,
  storage: KeyValueStore | undefined
): void => {
  if (restored.has(vm)) return;
  restored.add(vm);
  const entry = rememberedStreamVolume(storage, userId);
  if (!entry) return;
  touchVolume(storage, STREAM_VOLUMES_KEY, userId);
  vm.adjustPlaybackVolume(entry.volume);
  vm.commitPlaybackVolume();
  // muted: Element Call keeps the level above, so unmute returns to it
  if (entry.muted) vm.togglePlaybackMuted();
};

/** End of a drag: Element Call takes the level, and it is remembered for `userId`. */
export const commitAndRemember = (
  vm: ShareVolumeVm,
  userId: string,
  storage: KeyValueStore | undefined
): void => {
  vm.commitPlaybackVolume();
  const { volume } = readShareVolume(vm);
  if (volume > 0) {
    rememberStreamVolume(storage, userId, { volume, muted: false });
    return;
  }
  // dragged down to nothing: muted, at the level known before
  const before = rememberedStreamVolume(storage, userId)?.volume ?? 1;
  rememberStreamVolume(storage, userId, { volume: before, muted: true });
};

/** The mute button: Element Call mutes or returns to the level, and that is remembered. */
export const toggleAndRemember = (
  vm: ShareVolumeVm,
  userId: string,
  storage: KeyValueStore | undefined
): void => {
  const before = readShareVolume(vm).volume;
  vm.togglePlaybackMuted();
  const after = readShareVolume(vm).volume;
  if (after === 0) {
    rememberStreamVolume(storage, userId, {
      volume: before > 0 ? before : rememberedStreamVolume(storage, userId)?.volume ?? 1,
      muted: true,
    });
  } else {
    rememberStreamVolume(storage, userId, { volume: after, muted: false });
  }
};
