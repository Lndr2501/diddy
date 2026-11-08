/**
 * Who has their microphone muted in the call (#107): one answer for every Diddy view (stage
 * tiles, call status bar, avatar rings, the sidebar list under the call room).
 *
 * Element Call's tile marker is not trustworthy on its own. Its name-tag icon carries
 * `data-muted={playbackMuted || !audioEnabled}`, so it is also set when *you* muted somebody
 * "for me", and in real two-person calls (UI test report, finding F1) it showed every client's
 * own user as muted while they were sending, and somebody else as unmuted while their LiveKit
 * microphone publication was already muted. So each person is read from the most reliable
 * source there is:
 *
 *   1. you: Diddy's own call control state (what Element Call confirmed for the mute buttons);
 *   2. somebody else: the `isMuted` flag of their LiveKit microphone publication, read from the
 *      LiveKit room objects of the call document (found through React props, like shareVolume);
 *   3. only when no LiveKit room is reachable: Element Call's mute icon in the tile's name tag
 *      (`[class*="_muteIcon_"][data-muted]`), never any other `data-muted` element, and not
 *      while that icon means "muted for me".
 *
 * Stable hooks used (checked against Element Call 0.20.1, see tests/callMute.test.cjs):
 *   - `__reactContainer$…` on `#root`, fibers with `memoizedProps`
 *   - `livekitRoom` prop (LivekitRoomAudioRenderer, one per SFU connection),
 *     `vm.livekitRoomItems$.value[].livekitRoom` (InCallView)
 *   - LiveKit: `room.remoteParticipants` (Map), `participant.identity` = "@user:server:DEVICE",
 *     `participant.getTrackPublication("microphone").isMuted`
 *   - the tile's user media model (`vm` prop up the tile's fiber): `type: "user"`, `userId`,
 *     `local`, `rtcBackendIdentity`, `playbackMuted$` / `audioEnabled$` behaviours
 */

type Behavior<T> = { value: T };

type PublicationLike = { source?: unknown; isMuted?: unknown };

type ParticipantLike = {
  identity?: unknown;
  getTrackPublication?: (source: string) => PublicationLike | undefined;
  audioTrackPublications?: { values: () => Iterable<PublicationLike> };
};

export type LiveKitRoomLike = {
  state?: unknown;
  localParticipant: object;
  remoteParticipants: { values: () => Iterable<ParticipantLike> };
};

/** Your own microphone, as Diddy's call control knows it. */
export type LocalMic = { userId: string; microphone: boolean };

export const isLiveKitRoom = (value: unknown): value is LiveKitRoomLike => {
  const room = value as Partial<LiveKitRoomLike> | null | undefined;
  return (
    !!room &&
    typeof room === 'object' &&
    !!room.localParticipant &&
    typeof room.remoteParticipants?.values === 'function'
  );
};

const MICROPHONE = 'microphone';

const micPublication = (participant: ParticipantLike): PublicationLike | undefined => {
  const pub = participant.getTrackPublication?.(MICROPHONE);
  if (pub) return pub;
  const audio = participant.audioTrackPublications?.values();
  if (!audio) return undefined;
  return Array.from(audio).find((p) => p.source === MICROPHONE);
};

/**
 * Whether `userId`'s microphone is muted as LiveKit sees it: muted unless one of their
 * participants (devices) has a microphone publication that is not muted. A participant that
 * publishes no microphone at all counts as muted. `undefined` when no participant of theirs is in
 * any of `rooms`. `identity` (Element Call's rtcBackendIdentity of a tile) narrows it to one device.
 */
export const liveKitMicMuted = (
  rooms: readonly LiveKitRoomLike[],
  userId: string,
  identity?: string
): boolean | undefined => {
  const participants = (match: (id: string) => boolean): ParticipantLike[] => {
    const found: ParticipantLike[] = [];
    rooms.forEach((room) => {
      if (room.state === 'disconnected') return;
      Array.from(room.remoteParticipants.values()).forEach((p) => {
        if (match(String(p?.identity ?? ''))) found.push(p);
      });
    });
    return found;
  };
  let mine = identity ? participants((id) => id === identity) : [];
  if (mine.length === 0) mine = participants((id) => id.startsWith(`${userId}:`));
  if (mine.length === 0) return undefined;
  return !mine.some((p) => micPublication(p)?.isMuted === false);
};

type FiberLike = {
  memoizedProps?: Record<string, unknown> | null;
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  return?: FiberLike | null;
  stateNode?: { current?: FiberLike } | null;
};

const fiberOf = (node: object | null | undefined, prefix: string): FiberLike | undefined => {
  if (!node) return undefined;
  const key = Object.keys(node).find((k) => k.startsWith(prefix));
  return key ? ((node as Record<string, unknown>)[key] as FiberLike | undefined) : undefined;
};

const behaviorValue = (value: unknown): unknown =>
  value && typeof value === 'object' && 'value' in value
    ? (value as Behavior<unknown>).value
    : undefined;

/** LiveKit rooms a fiber's props hand on. */
const roomsInProps = (props: Record<string, unknown>): unknown[] => {
  const found: unknown[] = [props.livekitRoom, props.room];
  const items = behaviorValue((props.vm as Record<string, unknown> | undefined)?.livekitRoomItems$);
  if (Array.isArray(items)) items.forEach((item) => found.push(item?.livekitRoom));
  return found;
};

/** How many fibers of the call document are looked at, at most. */
const MAX_FIBERS = 20000;

type RootDoc = { getElementById?: (id: string) => object | null };

/** The LiveKit rooms of the call document (an empty list while none is reachable). */
export const findLiveKitRooms = (doc: RootDoc | null | undefined): LiveKitRoomLike[] => {
  const container = doc?.getElementById?.('root');
  const start = fiberOf(container ?? undefined, '__reactContainer$');
  if (!start) return [];
  const rooms = new Set<LiveKitRoomLike>();
  const queue: (FiberLike | null | undefined)[] = [start.stateNode?.current ?? start];
  for (let seen = 0; queue.length > 0 && seen < MAX_FIBERS; seen += 1) {
    const fiber = queue.shift();
    if (fiber) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object') {
        roomsInProps(props).forEach((room) => {
          if (isLiveKitRoom(room)) rooms.add(room);
        });
      }
      queue.push(fiber.child, fiber.sibling);
    }
  }
  return Array.from(rooms);
};

const ROOMS_TTL_MS = 3000;
const NO_ROOMS_TTL_MS = 1000;
const roomCache = new WeakMap<object, { rooms: LiveKitRoomLike[]; at: number }>();

/** findLiveKitRooms, walked again at most every few seconds per document. */
export const cachedLiveKitRooms = (
  doc: RootDoc | null | undefined,
  now: number = Date.now()
): LiveKitRoomLike[] => {
  if (!doc) return [];
  const cached = roomCache.get(doc);
  const ttl = cached?.rooms.length ? ROOMS_TTL_MS : NO_ROOMS_TTL_MS;
  if (cached && now - cached.at < ttl) return cached.rooms;
  let rooms: LiveKitRoomLike[] = [];
  try {
    rooms = findLiveKitRooms(doc);
  } catch {
    // a call document that is being torn down: no rooms this time
  }
  roomCache.set(doc, { rooms, at: now });
  return rooms;
};

/** Element Call's model of a person's media tile. */
export type UserMediaVmLike = {
  type: 'user';
  userId: string;
  local: boolean;
  rtcBackendIdentity?: string;
  playbackMuted$?: Behavior<unknown>;
  audioEnabled$?: Behavior<unknown>;
};

const isUserMediaVm = (vm: unknown): vm is UserMediaVmLike => {
  const m = vm as Partial<UserMediaVmLike> | null | undefined;
  return !!m && m.type === 'user' && typeof m.userId === 'string' && typeof m.local === 'boolean';
};

/** How far up from the tile's element the owner with the `vm` prop may be. */
const MAX_DEPTH = 30;

/** The user media model of the person tile `tile`, if React's internals are reachable. */
export const userVmOfTile = (tile: object | null | undefined): UserMediaVmLike | undefined => {
  let fiber = fiberOf(tile, '__reactFiber$');
  for (let depth = 0; fiber && depth < MAX_DEPTH; depth += 1) {
    const vm = fiber.memoizedProps?.vm;
    if (isUserMediaVm(vm)) return vm;
    fiber = fiber.return ?? undefined;
  }
  return undefined;
};

type MarkerLike = { getAttribute: (name: string) => string | null };
export type MuteTileLike = { querySelector: (selector: string) => MarkerLike | null };

/** Element Call's mute icon in the tile's name tag (GridTile `nameTagLeadingIcon`). */
export const MUTE_ICON_SELECTOR = '[class*="_muteIcon_"][data-muted]';

/**
 * The tile's own mute icon: `undefined` when the tile has none (the spotlight) or when the icon
 * only says that you muted the person for yourself.
 */
export const tileMuteMarker = (
  tile: MuteTileLike,
  vm?: UserMediaVmLike
): boolean | undefined => {
  const icon = tile.querySelector(MUTE_ICON_SELECTOR);
  if (!icon) return undefined;
  if (icon.getAttribute('data-muted') !== 'true') return false;
  // the same icon state means "muted for me": then only the model knows about the microphone
  if (vm?.playbackMuted$?.value === true) {
    const enabled = vm.audioEnabled$?.value;
    return typeof enabled === 'boolean' ? !enabled : undefined;
  }
  return true;
};

export type MuteContext = {
  /** you (this device), from Diddy's call control */
  local?: LocalMic;
  /** the call's LiveKit rooms */
  rooms?: readonly LiveKitRoomLike[];
};

/** Whether the person shown in `tile` has their microphone muted; `undefined` when unknown. */
export const tileMicMuted = (
  tile: MuteTileLike,
  userId: string,
  ctx: MuteContext
): boolean | undefined => {
  const vm = userVmOfTile(tile);
  const isYou = vm ? vm.local : userId === ctx.local?.userId;
  if (isYou && ctx.local && userId === ctx.local.userId) return !ctx.local.microphone;
  if (ctx.rooms && ctx.rooms.length > 0) {
    const muted = liveKitMicMuted(ctx.rooms, userId, vm?.rtcBackendIdentity);
    if (muted !== undefined) return muted;
  }
  return tileMuteMarker(tile, vm);
};

/**
 * Collects the answers of several tiles of one person (spotlight + grid, several devices):
 * muted when every tile that knows says muted.
 */
export class MuteVotes {
  private votes = new Map<string, boolean>();

  public add(userId: string, muted: boolean | undefined): void {
    if (muted === undefined) return;
    this.votes.set(userId, (this.votes.get(userId) ?? true) && muted);
  }

  public muted(userId: string): boolean {
    return this.votes.get(userId) ?? false;
  }

  public all(): Set<string> {
    return new Set(Array.from(this.votes).filter(([, m]) => m).map(([id]) => id));
  }
}
