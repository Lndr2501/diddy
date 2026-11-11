/**
 * Remembered voice volume per person (#103).
 *
 * Element Call has "Mute for me" and a volume slider in the menu of every remote person's tile
 * (also reached through Diddy's person menu, "Volume & Mute for me…"). That state lives in the
 * person's media view model (`RemoteUserMediaViewModel`, LiveKit `participant.setVolume`) and is
 * gone when the person or you leave: the next call starts them at 100 % again.
 *
 * Diddy finds those view models through the React props of the tiles (like shareVolume.ts does for
 * screen shares), gives a model it sees for the first time the volume remembered for its Matrix
 * user, and remembers every later change of that model (volumeMemory.ts, `diddyUserVolumes`).
 * Keyed by user id, not by participant (user + device), so all devices of a person share it.
 *
 * Stable hooks used (checked against Element Call 0.20.1):
 *   - `[data-testid="videoTile"]` tiles and their React fiber (`__reactFiber$…`), whose owners get
 *     the media view model as the `vm` prop
 *   - vm.type === "user", vm.local === false, vm.userId (the Matrix id)
 *   - vm.playbackVolume$ (behaviour: `value` + `subscribe`), vm.adjustPlaybackVolume(v),
 *     vm.commitPlaybackVolume(), vm.togglePlaybackMuted()
 * If any of that is missing after an Element Call update, nothing is restored or remembered.
 */
import {
  browserStorage,
  KeyValueStore,
  rememberedVolume,
  rememberVolume,
  touchVolume,
  USER_VOLUMES_KEY,
} from './volumeMemory';

type Subscription = { unsubscribe: () => void };
type Behavior<T> = { value: T; subscribe: (next: (value: T) => void) => Subscription };

export type UserVolumeVm = {
  type: string;
  local: boolean;
  userId: string;
  playbackVolume$: Behavior<number>;
  adjustPlaybackVolume: (volume: number) => void;
  commitPlaybackVolume: () => void;
  togglePlaybackMuted: () => void;
};

const isBehavior = (value: unknown): value is Behavior<unknown> =>
  !!value &&
  typeof (value as Behavior<unknown>).subscribe === 'function' &&
  'value' in (value as object);

/** True for the view model of a remote person (voice + camera) whose volume can be changed. */
export const isUserVolumeVm = (vm: unknown): vm is UserVolumeVm => {
  const m = vm as Partial<UserVolumeVm> | null | undefined;
  return (
    !!m &&
    m.type === 'user' &&
    m.local === false &&
    typeof m.userId === 'string' &&
    m.userId.startsWith('@') &&
    isBehavior(m.playbackVolume$) &&
    typeof m.adjustPlaybackVolume === 'function' &&
    typeof m.commitPlaybackVolume === 'function' &&
    typeof m.togglePlaybackMuted === 'function'
  );
};

type Fiber = { memoizedProps?: { vm?: unknown } | null; return?: Fiber | null };

/** How far up from the tile's element the owner with the `vm` prop may be. */
const MAX_DEPTH = 30;

type TileLike = {
  getAttribute?: (name: string) => string | null;
  querySelector?: (selector: string) => { getAttribute: (name: string) => string | null } | null;
};

/** The Matrix id shown on a tile (its avatar's aria-label), see callFrameMenu.ts. */
const tileLabelUserId = (tile: TileLike): string | undefined => {
  const label = tile.querySelector?.('[aria-label]')?.getAttribute('aria-label');
  return label && /^@[^\s:]+:[^\s]+$/.test(label) ? label : undefined;
};

/**
 * The view model of the remote person whose tile is `tile`: the nearest owner with a `vm` prop.
 * When the tile shows a Matrix id, the model must belong to that user.
 */
export const userVmOfTile = (tile: object | null | undefined): UserVolumeVm | undefined => {
  if (!tile) return undefined;
  const key = Object.keys(tile).find((k) => k.startsWith('__reactFiber$'));
  let fiber = key ? ((tile as Record<string, unknown>)[key] as Fiber | undefined) : undefined;
  const shownUserId = tileLabelUserId(tile as TileLike);
  for (let depth = 0; fiber && depth < MAX_DEPTH; depth += 1) {
    const vm = fiber.memoizedProps?.vm;
    if (vm !== undefined && vm !== null) {
      // the nearest model is this tile's: never one further up that belongs to something else
      if (!isUserVolumeVm(vm)) return undefined;
      return !shownUserId || vm.userId === shownUserId ? vm : undefined;
    }
    fiber = fiber.return ?? undefined;
  }
  return undefined;
};

type TileDoc = { querySelectorAll: (selector: string) => ArrayLike<object> };

/** All remote people's view models shown in the call document (each once). */
export const findUserVolumeVms = (doc: TileDoc | null | undefined): UserVolumeVm[] => {
  if (!doc) return [];
  const found = new Set<UserVolumeVm>();
  Array.from(doc.querySelectorAll('[data-testid="videoTile"]')).forEach((tile) => {
    const vm = userVmOfTile(tile);
    if (vm) found.add(vm);
  });
  return Array.from(found);
};

/** How long the slider has to rest before a level is written (dragging sends many values). */
export const SAVE_DELAY_MS = 400;

/** A drop to 0 from at least this level is the mute button, not the end of a drag. */
const MUTE_JUMP_MIN = 0.1;

type Tracked = { stop: () => void };
/** Models already restored and watched (each one only once, while it lives). */
const tracked = new WeakMap<object, Tracked>();

export type TrackOptions = {
  storage?: KeyValueStore;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Give a person's model that appears for the first time the volume remembered for them, then
 * remember whatever you change it to. Does nothing for a model seen before.
 */
export const trackUserVolume = (vm: UserVolumeVm, options: TrackOptions = {}): void => {
  if (tracked.has(vm)) return;
  const { storage } = options;
  const delay = options.delayMs ?? SAVE_DELAY_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const { userId } = vm;

  const entry = rememberedVolume(storage, USER_VOLUMES_KEY, userId);
  /** the last level that was kept (stored), what "muted" returns to after a drag to 0 */
  let level = entry?.volume ?? 1;
  if (entry) {
    touchVolume(storage, USER_VOLUMES_KEY, userId);
    vm.adjustPlaybackVolume(entry.volume);
    vm.commitPlaybackVolume();
    // muted: Element Call keeps the level above, so unmute returns to it
    if (entry.muted) vm.togglePlaybackMuted();
  }

  let timer: unknown;
  let last = Number(vm.playbackVolume$.value);
  /** the level just before the volume went to 0 (the mute button jumps straight from it) */
  let beforeZero = last > 0 ? last : level;
  const save = () => {
    timer = undefined;
    const volume = Math.min(2, Math.max(0, Number(vm.playbackVolume$.value) || 0));
    if (volume > 0) {
      level = volume;
      rememberVolume(storage, USER_VOLUMES_KEY, userId, { volume, muted: false });
    } else {
      // "Mute for me" jumps from the level to 0; a slider dragged down to 0 passes through tiny
      // levels and Element Call returns to the level from before the drag on unmute.
      if (beforeZero >= MUTE_JUMP_MIN) level = beforeZero;
      rememberVolume(storage, USER_VOLUMES_KEY, userId, { volume: level, muted: true });
    }
  };
  const sub = vm.playbackVolume$.subscribe((value) => {
    const v = Number(value);
    if (v === last) return;
    beforeZero = v === 0 ? last : v;
    last = v;
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(save, delay);
  });
  tracked.set(vm, {
    stop: () => {
      sub.unsubscribe();
      if (timer !== undefined) {
        clearTimer(timer);
        save();
      }
    },
  });
};

/** Stop watching `vm`, saving a change that is still waiting. */
export const untrackUserVolume = (vm: UserVolumeVm): void => {
  tracked.get(vm)?.stop();
};

/** Look for new remote people in the call document and track each of them. */
export const syncUserVolumes = (
  doc: TileDoc | null | undefined,
  options: TrackOptions = {}
): void => {
  findUserVolumeVms(doc).forEach((vm) => trackUserVolume(vm, options));
};

const INSTALLED_ATTR = 'data-diddy-user-volume';

/** Watch the call document for tiles and restore / remember each remote person's volume. */
export function installUserVolumeMemory(win: Window | null | undefined): void {
  try {
    const doc = win?.document;
    if (!doc?.body || doc.documentElement.hasAttribute(INSTALLED_ATTR)) return;
    doc.documentElement.setAttribute(INSTALLED_ATTR, 'true');
    let scheduled = false;
    const sync = () => {
      scheduled = false;
      syncUserVolumes(doc, { storage: browserStorage() });
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      win?.setTimeout(sync, 150);
    };
    new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
    schedule();
  } catch {
    // cross-origin or torn-down iframe: volumes simply start at 100 % as in Element Call
  }
}
