/**
 * Reading and writing Diddy profiles and badges (see types.ts). All hooks re-render when the
 * underlying state events change.
 */
import { useMemo, useSyncExternalStore } from 'react';
import {
  ClientEvent,
  Direction,
  Filter,
  MatrixClient,
  MatrixEvent,
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
  LIGHT_ROOMS_EVENT,
} from './optionsRoom';
import { sanitizeBadgeDef, sanitizeProfile } from './sanitize';

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
/** `sender` is the authenticated event sender (never trust names written inside the content). */
type Candidate = { content: Record<string, unknown>; ts: number; sender?: string };
/** roomId -> event type -> key -> newest content */
const messageData = new Map<string, Map<string, Map<string, Candidate>>>();
const backfilled = new Set<string>();

const ingestEvent = (event: MatrixEvent, roomId: string | undefined): boolean => {
  const type = event.getType();
  if (!roomId || !DIDDY_EVENTS.has(type) || event.isState()) return false;
  const raw = event.getContent() as Record<string, unknown> | undefined;
  const key = raw?.[KEY_FIELD];
  if (typeof key !== 'string' || !key) return false;
  if (type === PROFILE_EVENT && key !== event.getSender()) return false;
  if (type === BADGE_AWARD_EVENT && !parseAwardStateKey(key)) return false;
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
  byKey.set(key, { content, ts, sender: event.getSender() ?? undefined });
  return true;
};

const ingestRoomTimeline = (room: Room): boolean => {
  let changed = false;
  room
    .getLiveTimeline()
    .getEvents()
    .forEach((event) => {
      if (ingestEvent(event, room.roomId)) changed = true;
    });
  return changed;
};

const backfillRoom = (mx: MatrixClient, room: Room) => {
  if (backfilled.has(room.roomId)) return;
  backfilled.add(room.roomId);
  const filter = Filter.fromJson(mx.getUserId(), '', {
    room: { timeline: { types: [PROFILE_EVENT, BADGE_DEF_EVENT, BADGE_AWARD_EVENT] } },
  });
  mx.createMessagesRequest(room.roomId, null, 300, Direction.Backward, filter)
    .then((res) => {
      const mapper = mx.getEventMapper();
      let changed = false;
      res.chunk.forEach((raw) => {
        if (ingestEvent(mapper(raw), room.roomId)) changed = true;
      });
      if (changed) notify();
    })
    .catch(() => {
      backfilled.delete(room.roomId);
    });
};

/** Ingests the loaded timelines of all options rooms and backfills message-mode rooms once. */
const syncRooms = (mx: MatrixClient) => {
  let changed = false;
  getOptionsRooms(mx).forEach((room) => {
    if (ingestRoomTimeline(room)) changed = true;
    if (isLightOptionsRoom(room)) backfillRoom(mx, room);
  });
  if (changed) notify();
};

const attach = (mx: MatrixClient) => {
  if (attachedTo === mx) return;
  if (attachedTo) {
    attachedTo.off(RoomStateEvent.Events, onStateEvent);
    attachedTo.off(RoomEvent.Timeline, onTimelineEvent);
    attachedTo.off(ClientEvent.Room, onRoomChange);
    attachedTo.off(RoomEvent.MyMembership, onRoomChange);
    window.removeEventListener(LIGHT_ROOMS_EVENT, onLightRoomsChange);
  }
  attachedTo = mx;
  mx.on(RoomStateEvent.Events, onStateEvent);
  mx.on(RoomEvent.Timeline, onTimelineEvent);
  mx.on(ClientEvent.Room, onRoomChange);
  mx.on(RoomEvent.MyMembership, onRoomChange);
  window.addEventListener(LIGHT_ROOMS_EVENT, onLightRoomsChange);
  syncRooms(mx);
};
function onStateEvent(event: MatrixEvent) {
  const type = event.getType();
  if (DIDDY_EVENTS.has(type)) notify();
  // a new marker event turns a room into an options room: read what is already in its timeline
  if (type === OPTIONS_MARKER_EVENT && attachedTo) syncRooms(attachedTo);
}
function onTimelineEvent(event: MatrixEvent, room: Room | undefined) {
  if (ingestEvent(event, room?.roomId ?? event.getRoomId())) notify();
}
function onRoomChange() {
  if (attachedTo) syncRooms(attachedTo);
}
function onLightRoomsChange() {
  if (attachedTo) syncRooms(attachedTo);
  notify();
}

/** Newest of the state event content and the message-mode content for one key. */
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
  return [fromState, fromMessage].filter((c): c is Candidate => !!c);
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
  await mx.sendEvent(room.roomId, eventType as never, { ...content, [KEY_FIELD]: key } as never);
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
    const profile = sanitizeProfile(readData(rooms[i], PROFILE_EVENT, userId)?.content);
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

const readCustomBadges = (mx: MatrixClient): BadgeDef[] => {
  // all known versions of every definition, from every options room
  const all = new Map<string, Candidate[]>();
  getOptionsRooms(mx).forEach((room) => {
    dataKeys(room, BADGE_DEF_EVENT).forEach((id) => {
      const list = all.get(id) ?? [];
      list.push(...readCandidates(room, BADGE_DEF_EVENT, id));
      all.set(id, list);
    });
  });
  const defs: BadgeDef[] = [];
  all.forEach((candidates, id) => {
    // global badges ship with the app: custom events can never redefine them
    if (id.length > 64 || GLOBAL_BADGES.some((g) => g.id === id)) return;
    const valid = candidates
      .filter((c) => !!c.sender && !!sanitizeBadgeDef(c.content, id))
      .filter((c) => c.content.createdBy === undefined || c.content.createdBy === c.sender)
      .sort((a, b) => a.ts - b.ts);
    if (valid.length === 0) return;
    // first writer wins: only the creator (oldest event) may change a definition afterwards
    const owner = valid[0].sender;
    const chosen = valid.filter((c) => c.sender === owner).pop();
    const def = chosen && sanitizeBadgeDef(chosen.content, id);
    if (chosen && def) defs.push({ ...def, createdBy: chosen.sender });
  });
  return defs;
};

/** Global + custom badge definitions. */
export const useBadgeDefs = (mx: MatrixClient): BadgeDef[] => {
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => [...GLOBAL_BADGES, ...readCustomBadges(mx)], [mx, v]);
};

export type AwardedBadge = BadgeDef & { award: BadgeAward };

const readAwards = (mx: MatrixClient, userId: string, defs: BadgeDef[]): AwardedBadge[] => {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const result = new Map<string, AwardedBadge>();
  getOptionsRooms(mx).forEach((room) => {
    dataKeys(room, BADGE_AWARD_EVENT).forEach((stateKey) => {
      const key = parseAwardStateKey(stateKey);
      if (!key || key.userId !== userId) return;
      const data = readData(room, BADGE_AWARD_EVENT, stateKey);
      // an empty content is a revoked award; the giver is the real event sender, not content.by
      if (typeof data?.content.by !== 'string' || !data.content.by || !data.sender) return;
      const def = byId.get(key.badgeId);
      if (def) {
        const at = data.content.at;
        const award: BadgeAward = {
          by: data.sender,
          at: typeof at === 'number' && Number.isFinite(at) ? at : data.ts,
        };
        result.set(def.id, { ...def, award });
      }
    });
  });
  return Array.from(result.values());
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
