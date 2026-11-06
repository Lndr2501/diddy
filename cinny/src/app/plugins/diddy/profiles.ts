/**
 * Reading and writing Diddy profiles and badges (see types.ts). All hooks re-render when the
 * underlying state events change.
 *
 * Trust model
 * -----------
 * Every member of the options room (Diddy user or not) may send the Diddy event types, so all
 * data read from it is hostile until proven otherwise. Protections, all applied in the READ path:
 *  1. Sender must currently be a JOINED member of that room. Banning/kicking a spammer makes all
 *     of their data disappear from every client at once.
 *  2. Content larger than 4096 characters (JSON) is ignored; message-mode events are dropped at
 *     ingest so the cache stays small.
 *  3. Per sender: at most 25 badge definitions and 200 badge awards given (newest win); at most
 *     300 custom definitions overall (newest first, but awarded ones are never dropped).
 *  4. Events dated more than 24h in the future are ignored.
 *  5. Message-mode cache: max 2000 entries per room (300 per sender, oldest evicted), only events
 *     of options rooms are cached, backfill runs once per room and session (max 3 tries on error).
 *  6. Content is sanitized by whitelist (sanitize.ts): unknown keys are dropped, values validated.
 *  7. Identity comes from the event sender, never from content: profiles are only valid from the
 *     user they belong to, award givers and badge creators are the real senders, and global badge
 *     ids cannot be redefined.
 * Encrypted options rooms: events arrive as m.room.encrypted and are ingested only after they were
 * decrypted (client Decrypted event / explicit decryptEventIfNeeded); the same event may be seen
 * several times, ingest is idempotent (newest timestamp per key wins).
 * Moderators: see canModerateOptionsRoom() (optionsRoom.ts) and getOptionsRoomSenderStats().
 */
import { useMemo, useSyncExternalStore } from 'react';
import {
  ClientEvent,
  Direction,
  Filter,
  MatrixClient,
  MatrixEvent,
  MatrixEventEvent,
  EventType,
  Room,
  RoomEvent,
  RoomStateEvent,
} from 'matrix-js-sdk';
import {
  awardStateKey,
  BadgeAward,
  BadgeDef,
  BADGE_AWARD_EVENT,
  BADGE_DEF_EVENT,
  DiddyProfile,
  GLOBAL_BADGES,
  MAX_SHOWN_BADGES,
  OPTIONS_MARKER_EVENT,
  parseAwardStateKey,
  PROFILE_EVENT,
} from './types';
import {
  getOptionsRooms,
  getPrimaryOptionsRoom,
  isLightOptionsRoom,
  isOptionsRoom,
  LIGHT_ROOMS_EVENT,
} from './optionsRoom';
import { sanitizeBadgeDef, sanitizeProfile } from './sanitize';
import { diag } from '../diagnostics';

// --- change tracking ---------------------------------------------------------------------------

const DIDDY_EVENTS = new Set([PROFILE_EVENT, BADGE_DEF_EVENT, BADGE_AWARD_EVENT]);
let version = 0;
const listeners = new Set<() => void>();
let attachedTo: MatrixClient | undefined;
let scheduled = false;

const notify = () => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    version += 1;
    listeners.forEach((l) => l());
  });
};

// --- message mode cache --------------------------------------------------------------------------
// In rooms where the user may not write state events, Diddy data is sent as normal events carrying
// the would-be state key in content['app.diddy.key']. They are collected here.

const KEY_FIELD = 'app.diddy.key';

// --- abuse limits --------------------------------------------------------------------------------
const MAX_CONTENT_CHARS = 4096;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LENGTH = 300;
const MAX_DEFS_PER_SENDER = 25;
const MAX_AWARDS_PER_SENDER = 200;
const MAX_CUSTOM_DEFS = 300;
const MAX_CACHE_PER_ROOM = 2000;
const CACHE_TRIM_TARGET = 1800;
const MAX_CACHE_PER_SENDER = 300;
const MAX_BACKFILL_TRIES = 3;

const sizeVerdicts = new WeakMap<object, boolean>();
/** True when the JSON of the content is not larger than MAX_CONTENT_CHARS (cached per object). */
const isSmallContent = (content: object): boolean => {
  const known = sizeVerdicts.get(content);
  if (known !== undefined) return known;
  let ok = false;
  try {
    ok = JSON.stringify(content).length <= MAX_CONTENT_CHARS;
  } catch {
    ok = false;
  }
  sizeVerdicts.set(content, ok);
  return ok;
};

const isPlausibleTs = (ts: number): boolean =>
  Number.isFinite(ts) && ts <= Date.now() + MAX_FUTURE_MS;
/** `sender` is the authenticated event sender (never trust names written inside the content). */
type Candidate = { content: Record<string, unknown>; ts: number; sender?: string };
/** roomId -> event type -> key -> newest content */
const messageData = new Map<string, Map<string, Map<string, Candidate>>>();
const backfilled = new Set<string>();
const backfillTries = new Map<string, number>();
const membersRequested = new Set<string>();

/** Keeps the cache of one room small: per-sender quota first, then the oldest entries go. */
const trimRoomCache = (roomId: string) => {
  const byType = messageData.get(roomId);
  if (!byType) return;
  type Entry = { type: string; key: string; c: Candidate };
  const entries: Entry[] = [];
  byType.forEach((byKey, type) => byKey.forEach((c, key) => entries.push({ type, key, c })));
  if (entries.length <= MAX_CACHE_PER_ROOM) return;
  const drop = (e: Entry) => byType.get(e.type)?.delete(e.key);
  entries.sort((a, b) => b.c.ts - a.c.ts);
  const perSender = new Map<string, number>();
  const kept: Entry[] = [];
  entries.forEach((e) => {
    const sender = e.c.sender ?? '';
    const n = (perSender.get(sender) ?? 0) + 1;
    perSender.set(sender, n);
    if (n > MAX_CACHE_PER_SENDER) drop(e);
    else kept.push(e);
  });
  if (kept.length > MAX_CACHE_PER_ROOM) kept.slice(CACHE_TRIM_TARGET).forEach(drop);
};

const ENCRYPTED_TYPE = 'm.room.encrypted';

// --- diagnostics counters ------------------------------------------------------------------------
type DropReason = 'tooLarge' | 'future' | 'noKey' | 'badSender' | 'undecrypted';
const MAX_DROP_IDS = 5000;
/** roomId -> reason -> ids of dropped events (a set, so seeing an event twice counts once) */
const droppedIds = new Map<string, Map<DropReason, Set<string>>>();
const noteDrop = (roomId: string, reason: DropReason, event: MatrixEvent) => {
  const id = event.getId();
  if (!id) return;
  let byReason = droppedIds.get(roomId);
  if (!byReason) {
    byReason = new Map();
    droppedIds.set(roomId, byReason);
  }
  let ids = byReason.get(reason);
  if (!ids) {
    ids = new Set();
    byReason.set(reason, ids);
  }
  if (ids.size < MAX_DROP_IDS) ids.add(id);
};
const clearDrop = (roomId: string, reason: DropReason, event: MatrixEvent) => {
  const id = event.getId();
  if (id) droppedIds.get(roomId)?.get(reason)?.delete(id);
};

const ingestEvent = (event: MatrixEvent, roomId: string | undefined): boolean => {
  const type = event.getType();
  if (!roomId || event.isState()) return false;
  if (type === ENCRYPTED_TYPE) {
    // not decrypted (yet): handled again once the Decrypted event fires
    noteDrop(roomId, 'undecrypted', event);
    return false;
  }
  clearDrop(roomId, 'undecrypted', event);
  if (!DIDDY_EVENTS.has(type)) return false;
  const raw = event.getContent() as Record<string, unknown> | undefined;
  const key = raw?.[KEY_FIELD];
  if (typeof key !== 'string' || !key || key.length > MAX_KEY_LENGTH) {
    noteDrop(roomId, 'noKey', event);
    return false;
  }
  // oversized / far-future events are dropped immediately so they never enter the cache
  if (!raw || !isSmallContent(raw)) {
    noteDrop(roomId, 'tooLarge', event);
    return false;
  }
  if (!isPlausibleTs(event.getTs())) {
    noteDrop(roomId, 'future', event);
    return false;
  }
  const sender = event.getSender();
  if (!sender) {
    noteDrop(roomId, 'badSender', event);
    return false;
  }
  if (
    (type === PROFILE_EVENT && key !== sender) ||
    (type === BADGE_AWARD_EVENT && !parseAwardStateKey(key))
  ) {
    noteDrop(roomId, 'badSender', event);
    return false;
  }
  const content = { ...raw };
  delete content[KEY_FIELD];
  const ts = event.getTs();
  let byType = messageData.get(roomId);
  if (!byType) {
    byType = new Map();
    messageData.set(roomId, byType);
  }
  let byKey = byType.get(type);
  if (!byKey) {
    byKey = new Map();
    byType.set(type, byKey);
  }
  const existing = byKey.get(key);
  if (existing && existing.ts >= ts) return false;
  byKey.set(key, { content, ts, sender });
  trimRoomCache(roomId);
  if (type === PROFILE_EVENT) diag(`diddy: profile ingested user=${key} source=message room=${roomId}`);
  return true;
};

const loggedDecryptFailures = new Set<string>();
const pendingDecrypt = new WeakSet<MatrixEvent>();

const logDecryptFailure = (event: MatrixEvent, roomId: string) => {
  const id = event.getId();
  if (!id || loggedDecryptFailures.has(id) || loggedDecryptFailures.size > MAX_DROP_IDS) return;
  loggedDecryptFailures.add(id);
  diag(`diddy: decrypt failure room=${roomId} event=${id} sender=${event.getSender() ?? '?'}`);
};

/** Decrypts an encrypted event of an options room and ingests it afterwards (once per event object). */
const decryptAndIngest = (mx: MatrixClient, event: MatrixEvent, roomId: string) => {
  noteDrop(roomId, 'undecrypted', event);
  if (pendingDecrypt.has(event)) return;
  pendingDecrypt.add(event);
  mx.decryptEventIfNeeded(event)
    .catch(() => {})
    .then(() => {
      pendingDecrypt.delete(event);
      if (event.getType() === ENCRYPTED_TYPE) {
        // still encrypted (no keys yet): the client emits Decrypted again when keys arrive
        if (!event.isBeingDecrypted()) logDecryptFailure(event, roomId);
        return;
      }
      if (ingestEvent(event, roomId)) notify();
    });
};

const ingestRoomTimeline = (mx: MatrixClient, room: Room): boolean => {
  let changed = false;
  room
    .getLiveTimeline()
    .getEvents()
    .forEach((event) => {
      if (event.getType() === ENCRYPTED_TYPE) decryptAndIngest(mx, event, room.roomId);
      else if (ingestEvent(event, room.roomId)) changed = true;
    });
  return changed;
};

/** Runs `fn` over all items with at most `limit` running at the same time. */
const runLimited = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      next += 1;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[next - 1]).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

type BackfillResult = { fetched: number; ingested: number };

/** Unencrypted room: the server filters by event type. */
const backfillFiltered = async (mx: MatrixClient, room: Room): Promise<BackfillResult> => {
  const filter = Filter.fromJson(mx.getUserId(), '', {
    room: { timeline: { types: [PROFILE_EVENT, BADGE_DEF_EVENT, BADGE_AWARD_EVENT] } },
  });
  const res = await mx.createMessagesRequest(room.roomId, null, 300, Direction.Backward, filter);
  const mapper = mx.getEventMapper();
  let ingested = 0;
  res.chunk.forEach((raw) => {
    if (ingestEvent(mapper(raw), room.roomId)) ingested += 1;
  });
  return { fetched: res.chunk.length, ingested };
};

/** Encrypted room: type filtering is impossible, fetch the last 300 events (2 pages) and decrypt. */
const backfillEncrypted = async (mx: MatrixClient, room: Room): Promise<BackfillResult> => {
  const mapper = mx.getEventMapper();
  let from: string | null = null;
  let fetched = 0;
  let ingested = 0;
  for (let page = 0; page < 2; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = (await mx.createMessagesRequest(room.roomId, from, 150, Direction.Backward)) as unknown as {
      chunk: Parameters<typeof mapper>[0][];
      end?: string;
    };
    const events = res.chunk.map((raw) => mapper(raw)).filter((e) => !e.isState());
    fetched += events.length;
    // eslint-disable-next-line no-await-in-loop
    await runLimited(events, 20, async (e) => {
      await mx.decryptEventIfNeeded(e).catch(() => {});
      if (e.getType() === ENCRYPTED_TYPE) logDecryptFailure(e, room.roomId);
      if (ingestEvent(e, room.roomId)) ingested += 1;
    });
    if (!res.end || res.chunk.length === 0) break;
    from = res.end;
  }
  return { fetched, ingested };
};

const backfillRoom = (mx: MatrixClient, room: Room) => {
  if (backfilled.has(room.roomId)) return;
  backfilled.add(room.roomId);
  backfillTries.set(room.roomId, (backfillTries.get(room.roomId) ?? 0) + 1);
  const encrypted = mx.isRoomEncrypted(room.roomId);
  (encrypted ? backfillEncrypted(mx, room) : backfillFiltered(mx, room))
    .then(({ fetched, ingested }) => {
      diag(`diddy: backfill done room=${room.roomId} encrypted=${encrypted} fetched=${fetched} ingested=${ingested}`);
      if (ingested > 0) notify();
    })
    .catch((e) => {
      diag(`diddy: backfill failed room=${room.roomId} encrypted=${encrypted}: ${e instanceof Error ? e.message : String(e)}`);
      // retry on a later sync, but never more than MAX_BACKFILL_TRIES times per session
      if ((backfillTries.get(room.roomId) ?? 0) < MAX_BACKFILL_TRIES) backfilled.delete(room.roomId);
    });
};

/** Ingests the loaded timelines of all options rooms and backfills message-mode rooms once. */
const roomMode = (room: Room): 'state' | 'message' | 'both' => {
  const marker = !!room.currentState.getStateEvents(OPTIONS_MARKER_EVENT, '');
  const light = isLightOptionsRoom(room);
  if (marker && light) return 'both';
  return light ? 'message' : 'state';
};
const announcedRooms = new Set<string>();

const syncRooms = (mx: MatrixClient) => {
  let changed = false;
  getOptionsRooms(mx).forEach((room) => {
    if (!announcedRooms.has(room.roomId)) {
      announcedRooms.add(room.roomId);
      diag(`diddy: options room added room=${room.roomId} mode=${roomMode(room)} encrypted=${mx.isRoomEncrypted(room.roomId)}`);
    }
    // senders are checked against the member list, which is lazy loaded: fetch it once per room
    if (!membersRequested.has(room.roomId)) {
      membersRequested.add(room.roomId);
      room
        .loadMembersIfNeeded()
        .then(() => notify())
        .catch(() => {});
    }
    if (ingestRoomTimeline(mx, room)) changed = true;
    if (isLightOptionsRoom(room)) backfillRoom(mx, room);
  });
  if (changed) notify();
};

const attach = (mx: MatrixClient) => {
  if (attachedTo === mx) return;
  if (attachedTo) {
    attachedTo.off(RoomStateEvent.Events, onStateEvent);
    attachedTo.off(RoomEvent.Timeline, onTimelineEvent);
    attachedTo.off(MatrixEventEvent.Decrypted, onDecrypted);
    attachedTo.off(ClientEvent.Room, onRoomChange);
    attachedTo.off(RoomEvent.MyMembership, onRoomChange);
    window.removeEventListener(LIGHT_ROOMS_EVENT, onLightRoomsChange);
  }
  attachedTo = mx;
  mx.on(RoomStateEvent.Events, onStateEvent);
  mx.on(RoomEvent.Timeline, onTimelineEvent);
  mx.on(MatrixEventEvent.Decrypted, onDecrypted);
  mx.on(ClientEvent.Room, onRoomChange);
  mx.on(RoomEvent.MyMembership, onRoomChange);
  window.addEventListener(LIGHT_ROOMS_EVENT, onLightRoomsChange);
  syncRooms(mx);
};
function onStateEvent(event: MatrixEvent) {
  const type = event.getType();
  if (DIDDY_EVENTS.has(type)) {
    if (type === PROFILE_EVENT) diag(`diddy: profile ingested user=${event.getStateKey() ?? '?'} source=state room=${event.getRoomId() ?? '?'}`);
    notify();
  }
  // a new marker event turns a room into an options room: read what is already in its timeline
  if (type === OPTIONS_MARKER_EVENT && attachedTo) syncRooms(attachedTo);
  // joins / leaves / bans in an options room change whose data is trusted
  if (type === EventType.RoomMember && attachedTo) {
    const roomId = event.getRoomId();
    if (roomId && isOptionsRoom(attachedTo.getRoom(roomId))) notify();
  }
}
function onTimelineEvent(event: MatrixEvent, room: Room | undefined) {
  // only options rooms are cached: other rooms could otherwise fill the memory
  if (!room) return;
  const type = event.getType();
  if (!(DIDDY_EVENTS.has(type) || type === ENCRYPTED_TYPE) || !isOptionsRoom(room)) return;
  if (type === ENCRYPTED_TYPE) {
    // encrypted room: ingest after decryption (also covered by onDecrypted)
    if (attachedTo) decryptAndIngest(attachedTo, event, room.roomId);
    return;
  }
  if (ingestEvent(event, room.roomId)) notify();
}
/** Fires (also later, when keys arrive) after an event was decrypted; ingest is idempotent. */
function onDecrypted(event: MatrixEvent) {
  const roomId = event.getRoomId();
  const room = roomId && attachedTo ? attachedTo.getRoom(roomId) : null;
  if (!room || !roomId || !isOptionsRoom(room)) return;
  if (event.getType() === ENCRYPTED_TYPE) {
    if (event.isDecryptionFailure()) logDecryptFailure(event, roomId);
    return;
  }
  if (ingestEvent(event, roomId)) notify();
}
function onRoomChange() {
  if (attachedTo) syncRooms(attachedTo);
  notify();
}
function onLightRoomsChange() {
  if (attachedTo) syncRooms(attachedTo);
  notify();
}

/** Newest of the state event content and the message-mode content for one key. */
const isAcceptable = (room: Room, c: Candidate): boolean =>
  !!c.sender &&
  room.getMember(c.sender)?.membership === 'join' &&
  isPlausibleTs(c.ts) &&
  isSmallContent(c.content);

/** Candidates that pass the trust checks (joined sender, size, timestamp). */
const readCandidates = (room: Room, type: string, key: string): Candidate[] => {
  const state = room.currentState.getStateEvents(type, key);
  const fromState: Candidate | undefined = state
    ? {
        content: (state.getContent() ?? {}) as Record<string, unknown>,
        ts: state.getTs(),
        sender: state.getSender() ?? undefined,
      }
    : undefined;
  const fromMessage = messageData.get(room.roomId)?.get(type)?.get(key);
  return [fromState, fromMessage].filter((c): c is Candidate => !!c && isAcceptable(room, c));
};

const readData = (room: Room, type: string, key: string): Candidate | undefined => {
  const candidates = readCandidates(room, type, key);
  if (candidates.length === 2) return candidates[1].ts > candidates[0].ts ? candidates[1] : candidates[0];
  return candidates[0];
};

/** All keys of a type that exist in either source of a room. */
const dataKeys = (room: Room, type: string): string[] => {
  const keys = new Set<string>();
  room.currentState.getStateEvents(type).forEach((event) => {
    const key = event.getStateKey();
    if (key) keys.add(key);
  });
  messageData
    .get(room.roomId)
    ?.get(type)
    ?.forEach((_, key) => keys.add(key));
  return Array.from(keys);
};

/**
 * Writes Diddy data. In a normal options room it is a state event; when that is not allowed (or in
 * a message-mode room) it is sent as a normal event carrying the key in content['app.diddy.key'].
 */
export const writeDiddyData = async (
  mx: MatrixClient,
  room: Room,
  eventType: string,
  content: object,
  key: string
): Promise<void> => {
  if (!isLightOptionsRoom(room) && room.currentState.getStateEvents(OPTIONS_MARKER_EVENT, '')) {
    try {
      await mx.sendStateEvent(room.roomId, eventType as never, content as never, key);
      return;
    } catch (e) {
      // only "not allowed to write state here" falls back to a normal event
      if ((e as { errcode?: string } | null)?.errcode !== 'M_FORBIDDEN') throw e;
    }
  }
  try {
    await mx.sendEvent(room.roomId, eventType as never, { ...content, [KEY_FIELD]: key } as never);
  } catch (e) {
    if (mx.isRoomEncrypted(room.roomId)) {
      throw new Error(
        `Could not send encrypted profile data: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    throw e;
  }
};

const useDiddyVersion = (mx: MatrixClient): number => {
  attach(mx);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version
  );
};

// --- profiles ----------------------------------------------------------------------------------

export const readProfile = (mx: MatrixClient, userId: string): DiddyProfile | undefined => {
  const rooms = getOptionsRooms(mx);
  for (let i = 0; i < rooms.length; i += 1) {
    const data = readData(rooms[i], PROFILE_EVENT, userId);
    // a profile only counts when it was written by the user it belongs to
    const profile = data && data.sender === userId ? sanitizeProfile(data.content) : undefined;
    if (profile) return profile;
  }
  return undefined;
};

/** The customization of a user, or undefined if they have none / are not on Diddy. */
export const useDiddyProfile = (mx: MatrixClient, userId: string | undefined): DiddyProfile | undefined => {
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (userId ? readProfile(mx, userId) : undefined), [mx, userId, v]);
};

export const setMyProfile = async (mx: MatrixClient, profile: DiddyProfile): Promise<void> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  await writeDiddyData(mx, room, PROFILE_EVENT, profile, mx.getSafeUserId());
};

/** Updates parts of your profile, keeping everything else. */
export const patchMyProfile = async (mx: MatrixClient, patch: Partial<DiddyProfile>): Promise<void> => {
  const current = readProfile(mx, mx.getSafeUserId()) ?? { v: 1 as const };
  await setMyProfile(mx, { ...current, ...patch, v: 1 });
};

// --- badges ------------------------------------------------------------------------------------

type AwardRec = { badgeId: string; userId: string; by: string; at: number; ts: number };
type Derived = {
  v: number;
  mx: MatrixClient;
  /** trusted awards (per-sender cap applied), by receiving user */
  awardsByUser: Map<string, AwardRec[]>;
  defs: BadgeDef[];
};
let derived: Derived | undefined;

/** Newest `max` items per sender. */
const capPerSender = <T extends { ts: number }>(items: T[], senderOf: (t: T) => string, max: number): T[] => {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const sender = senderOf(item);
    const list = groups.get(sender);
    if (list) list.push(item);
    else groups.set(sender, [item]);
  });
  const out: T[] = [];
  groups.forEach((list) => {
    out.push(...list.sort((x, y) => y.ts - x.ts).slice(0, max));
  });
  return out;
};

const collectAwards = (mx: MatrixClient): AwardRec[] => {
  const all: AwardRec[] = [];
  getOptionsRooms(mx).forEach((room) => {
    dataKeys(room, BADGE_AWARD_EVENT).forEach((stateKey) => {
      const key = parseAwardStateKey(stateKey);
      if (!key) return;
      const data = readData(room, BADGE_AWARD_EVENT, stateKey);
      // an empty content is a revoked award; the giver is the real event sender, not content.by
      if (typeof data?.content.by !== 'string' || !data.content.by || !data.sender) return;
      const at = data.content.at;
      all.push({
        badgeId: key.badgeId,
        userId: key.userId,
        by: data.sender,
        at: typeof at === 'number' && Number.isFinite(at) ? at : data.ts,
        ts: data.ts,
      });
    });
  });
  return capPerSender(all, (r) => r.by, MAX_AWARDS_PER_SENDER);
};

type DefRec = { def: BadgeDef; ts: number; sender: string };

const collectCustomBadges = (mx: MatrixClient, awardedIds: Set<string>): BadgeDef[] => {
  // all known versions of every definition, from every options room
  const all = new Map<string, Candidate[]>();
  getOptionsRooms(mx).forEach((room) => {
    dataKeys(room, BADGE_DEF_EVENT).forEach((id) => {
      if (id.length > 64) return;
      const list = all.get(id) ?? [];
      list.push(...readCandidates(room, BADGE_DEF_EVENT, id));
      all.set(id, list);
    });
  });
  const recs: DefRec[] = [];
  all.forEach((candidates, id) => {
    // global badges ship with the app: custom events can never redefine them
    if (GLOBAL_BADGES.some((g) => g.id === id)) return;
    const valid = candidates
      .filter((c) => !!c.sender && !!sanitizeBadgeDef(c.content, id))
      .filter((c) => c.content.createdBy === undefined || c.content.createdBy === c.sender)
      .sort((a, b) => a.ts - b.ts);
    if (valid.length === 0) return;
    // first writer wins: only the creator (oldest event) may change a definition afterwards
    const owner = valid[0].sender;
    const chosen = valid.filter((c) => c.sender === owner).pop();
    const def = chosen && sanitizeBadgeDef(chosen.content, id);
    if (chosen && def && chosen.sender) recs.push({ def: { ...def, createdBy: chosen.sender }, ts: chosen.ts, sender: chosen.sender });
  });
  const capped = capPerSender(recs, (r) => r.sender, MAX_DEFS_PER_SENDER).sort((a, b) => b.ts - a.ts);
  // overall cap, newest first; definitions that are awarded to someone are never dropped
  let slots = MAX_CUSTOM_DEFS - capped.filter((r) => awardedIds.has(r.def.id)).length;
  return capped
    .filter((r) => {
      if (awardedIds.has(r.def.id)) return true;
      if (slots <= 0) return false;
      slots -= 1;
      return true;
    })
    .map((r) => r.def);
};

/** Trusted, size-limited view of the options rooms for one data version (cached). */
const getDerived = (mx: MatrixClient): Derived => {
  if (derived && derived.mx === mx && derived.v === version) return derived;
  const awards = collectAwards(mx);
  const awardsByUser = new Map<string, AwardRec[]>();
  awards.forEach((r) => {
    const list = awardsByUser.get(r.userId);
    if (list) list.push(r);
    else awardsByUser.set(r.userId, [r]);
  });
  const defs = collectCustomBadges(mx, new Set(awards.map((r) => r.badgeId)));
  derived = { v: version, mx, awardsByUser, defs };
  return derived;
};

/** Global + custom badge definitions. */
export const useBadgeDefs = (mx: MatrixClient): BadgeDef[] => {
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => [...GLOBAL_BADGES, ...getDerived(mx).defs], [mx, v]);
};

export type AwardedBadge = BadgeDef & { award: BadgeAward };

const readAwards = (mx: MatrixClient, userId: string, defs: BadgeDef[]): AwardedBadge[] => {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const result = new Map<string, AwardedBadge & { ts: number }>();
  (getDerived(mx).awardsByUser.get(userId) ?? []).forEach((r) => {
    const def = byId.get(r.badgeId);
    const existing = result.get(r.badgeId);
    if (def && (!existing || r.ts > existing.ts)) {
      result.set(def.id, { ...def, award: { by: r.by, at: r.at }, ts: r.ts });
    }
  });
  return Array.from(result.values()).map(({ ts, ...badge }) => badge);
};

/** All badges a user has been given. */
export const useUserBadges = (mx: MatrixClient, userId: string | undefined): AwardedBadge[] => {
  const defs = useBadgeDefs(mx);
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (userId ? readAwards(mx, userId, defs) : []), [mx, userId, defs, v]);
};

/** The badges the user chose to show next to their name (only ones they really have). */
export const useShownBadges = (mx: MatrixClient, userId: string | undefined): AwardedBadge[] => {
  const profile = useDiddyProfile(mx, userId);
  const owned = useUserBadges(mx, userId);
  return useMemo(() => {
    const ids = profile?.shownBadges ?? [];
    return ids
      .map((id) => owned.find((b) => b.id === id))
      .filter((b): b is AwardedBadge => !!b)
      .slice(0, MAX_SHOWN_BADGES);
  }, [profile, owned]);
};

export const createCustomBadge = async (
  mx: MatrixClient,
  def: Omit<BadgeDef, 'id' | 'createdBy' | 'global'>
): Promise<string> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  const id = `c.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await writeDiddyData(mx, room, BADGE_DEF_EVENT, { ...def, createdBy: mx.getSafeUserId() }, id);
  return id;
};

export const awardBadge = async (mx: MatrixClient, badgeId: string, userId: string): Promise<void> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  const content: BadgeAward = { by: mx.getSafeUserId(), at: Date.now() };
  await writeDiddyData(mx, room, BADGE_AWARD_EVENT, content, awardStateKey(badgeId, userId));
};

export const revokeBadge = async (mx: MatrixClient, badgeId: string, userId: string): Promise<void> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  await writeDiddyData(mx, room, BADGE_AWARD_EVENT, {}, awardStateKey(badgeId, userId));
};

// --- moderation --------------------------------------------------------------------------------

export type OptionsRoomSenderStats = { userId: string; profiles: number; defs: number; awards: number };

/**
 * Raw (unsanitized, unfiltered) number of Diddy events per sender across all options rooms, loaded
 * state events plus the message-mode cache, busiest first. Includes senders who already left or
 * were banned. Meant for a moderator list; pure, no UI.
 */
export const getOptionsRoomSenderStats = (mx: MatrixClient): OptionsRoomSenderStats[] => {
  const stats = new Map<string, OptionsRoomSenderStats>();
  const bump = (sender: string | undefined, field: 'profiles' | 'defs' | 'awards') => {
    if (!sender) return;
    let entry = stats.get(sender);
    if (!entry) {
      entry = { userId: sender, profiles: 0, defs: 0, awards: 0 };
      stats.set(sender, entry);
    }
    entry[field] += 1;
  };
  const fields: [string, 'profiles' | 'defs' | 'awards'][] = [
    [PROFILE_EVENT, 'profiles'],
    [BADGE_DEF_EVENT, 'defs'],
    [BADGE_AWARD_EVENT, 'awards'],
  ];
  getOptionsRooms(mx).forEach((room) => {
    fields.forEach(([type, field]) => {
      room.currentState.getStateEvents(type).forEach((event) => bump(event.getSender() ?? undefined, field));
      messageData
        .get(room.roomId)
        ?.get(type)
        ?.forEach((c) => bump(c.sender, field));
    });
  });
  return Array.from(stats.values()).sort(
    (a, b) => b.profiles + b.defs + b.awards - (a.profiles + a.defs + a.awards)
  );
};

// --- debugging -----------------------------------------------------------------------------------

export type DiddyDebugRoom = {
  roomId: string;
  name: string;
  mode: 'state' | 'message' | 'both';
  encrypted: boolean;
  joinedMembers: number;
  stateEvents: number;
  messageEvents: number;
  profilesAccepted: number;
  dropped: Record<string, number>;
};

/** Per options room: what was seen, what was accepted and why events were dropped. */
export const getDiddyDebugInfo = (mx: MatrixClient): { rooms: DiddyDebugRoom[] } => ({
  rooms: getOptionsRooms(mx).map((room) => {
    const dropped: Record<string, number> = {
      nonMember: 0,
      tooLarge: 0,
      future: 0,
      noKey: 0,
      badSender: 0,
      undecrypted: 0,
    };
    droppedIds.get(room.roomId)?.forEach((ids, reason) => {
      dropped[reason] += ids.size;
    });
    let stateEvents = 0;
    let messageEvents = 0;
    let profilesAccepted = 0;
    // stored candidates that fail the read-path checks (counted on demand to keep reads cheap)
    const check = (c: Candidate) => {
      if (!c.sender || room.getMember(c.sender)?.membership !== 'join') dropped.nonMember += 1;
      else if (!isSmallContent(c.content)) dropped.tooLarge += 1;
      else if (!isPlausibleTs(c.ts)) dropped.future += 1;
    };
    DIDDY_EVENTS.forEach((type) => {
      room.currentState.getStateEvents(type).forEach((event) => {
        stateEvents += 1;
        check({
          content: (event.getContent() ?? {}) as Record<string, unknown>,
          ts: event.getTs(),
          sender: event.getSender() ?? undefined,
        });
      });
      messageData
        .get(room.roomId)
        ?.get(type)
        ?.forEach((c) => {
          messageEvents += 1;
          check(c);
        });
    });
    dataKeys(room, PROFILE_EVENT).forEach((userId) => {
      const data = readData(room, PROFILE_EVENT, userId);
      if (data && data.sender === userId && sanitizeProfile(data.content)) profilesAccepted += 1;
    });
    return {
      roomId: room.roomId,
      name: room.name,
      mode: roomMode(room),
      encrypted: mx.isRoomEncrypted(room.roomId),
      joinedMembers: room.getJoinedMemberCount(),
      stateEvents,
      messageEvents,
      profilesAccepted,
      dropped,
    };
  }),
});
