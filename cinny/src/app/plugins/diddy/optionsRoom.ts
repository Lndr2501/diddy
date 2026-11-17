/**
 * The hidden "Diddy Options" room: finding it, hiding it from the room lists, creating it and
 * joining it automatically from a space. See types.ts for what is stored in it.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ClientEvent,
  EventType,
  MatrixClient,
  Room,
  RoomEvent,
  RoomStateEvent,
  Visibility,
  Preset,
} from 'matrix-js-sdk';
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';
import {
  BADGE_AWARD_EVENT,
  BADGE_DEF_EVENT,
  OPTIONS_MARKER_EVENT,
  OPTIONS_ROOM_NAME,
  PROFILE_EVENT,
} from './types';
import { diag } from '../diagnostics';
import { BADGE_STATE_LEVEL } from './badgePower';
import { getHierarchyPage } from './hierarchyCache';
import {
  parseRoomLists,
  reconcileRoomLists,
  RoomLists,
  roomListsContent,
  ROOM_LISTS_EVENT,
  sameRoomLists,
} from './roomListSync';
import { AUTO_CREATED_EVENT, autoCreatedContent, parseAutoCreated, shouldAutoCreate } from './autoCreate';

/** Synchronous read of the "Developer Tools" setting (it lives in localStorage). */
export const isDeveloperToolsOn = (): boolean => {
  try {
    return JSON.parse(localStorage.getItem('settings') ?? '{}').developerTools === true;
  } catch {
    return false;
  }
};

// --- "message mode" rooms ----------------------------------------------------------------------
// Rooms the user cannot change state in can still be used: the Diddy data is then sent as hidden
// normal messages. Which rooms are used that way is remembered locally.

const LIGHT_ROOMS_KEY = 'diddyLightRooms';
export const LIGHT_ROOMS_EVENT = 'diddy-light-rooms-change';

export const getLightRoomIds = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LIGHT_ROOMS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

// isOptionsRoom runs for every encrypted event and every profile lookup; reading and parsing
// localStorage each time was a large part of drawing a busy timeline. The set is kept in memory
// and dropped when it changes here or in another window.
let lightRoomCache: Set<string> | undefined;
const lightRoomSet = (): Set<string> => {
  if (!lightRoomCache) lightRoomCache = new Set(getLightRoomIds());
  return lightRoomCache;
};
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === LIGHT_ROOMS_KEY) lightRoomCache = undefined;
  });
}

const setLightRoomIds = (ids: string[], share = true) => {
  lightRoomCache = undefined;
  try {
    localStorage.setItem(LIGHT_ROOMS_KEY, JSON.stringify(ids));
  } catch {
    // ignore (storage full / unavailable)
  }
  window.dispatchEvent(new CustomEvent(LIGHT_ROOMS_EVENT));
  // eslint-disable-next-line no-use-before-define
  if (share) shareRoomLists();
};

export const addLightOptionsRoom = (roomId: string): void => {
  const ids = getLightRoomIds();
  if (!ids.includes(roomId)) {
    ids.push(roomId);
    diag(`diddy: room selected as message-mode options room room=${roomId}`);
  }
  // picked again on purpose: it is no longer a room that was left for good
  // eslint-disable-next-line no-use-before-define
  forgetLeftOptionsRoom(roomId);
  setLightRoomIds(ids);
};

export const removeLightOptionsRoom = (roomId: string): void => {
  setLightRoomIds(getLightRoomIds().filter((id) => id !== roomId));
  // removed on purpose: connectMarkedRooms must not add it again by itself
  // eslint-disable-next-line no-use-before-define
  rememberLeftOptionsRoom(roomId);
};

export const isLightOptionsRoom = (room: Room | null | undefined): boolean =>
  !!room && lightRoomSet().has(room.roomId);

// --- rooms the user left on purpose ------------------------------------------------------------
// Those are never joined automatically again.

const LEFT_ROOMS_KEY = 'diddyLeftOptionsRooms';

const getLeftRoomIds = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEFT_ROOMS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const setLeftRoomIds = (ids: string[], share = true) => {
  try {
    localStorage.setItem(LEFT_ROOMS_KEY, JSON.stringify(ids));
  } catch {
    // ignore (storage full / unavailable)
  }
  // eslint-disable-next-line no-use-before-define
  if (share) shareRoomLists();
};

/** Call when the user leaves an options room themselves: it will not be auto-joined again. */
export const rememberLeftOptionsRoom = (roomId: string): void => {
  const ids = getLeftRoomIds();
  if (ids.includes(roomId)) return;
  setLeftRoomIds([...ids, roomId]);
};

const forgetLeftOptionsRoom = (roomId: string): void => {
  const ids = getLeftRoomIds();
  if (ids.includes(roomId)) setLeftRoomIds(ids.filter((id) => id !== roomId), false);
};

export const wasLeftOnPurpose = (roomId: string): boolean => getLeftRoomIds().includes(roomId);

// --- the same lists on every device of the account (roomListSync.ts) ----------------------------

const MERGED_KEY = 'diddyRoomListsMerged';
let listClient: MatrixClient | undefined;
/** The account data was read for listClient (then local changes are written right away). */
let listsReconciled = false;
/** Local changes made before the account data was known: joined with it instead of replaced. */
let localChangesPending = false;

const mergedUsers = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MERGED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};
const markMerged = (userId: string) => {
  const users = mergedUsers();
  if (users.includes(userId)) return;
  try {
    localStorage.setItem(MERGED_KEY, JSON.stringify([...users, userId]));
  } catch {
    // ignore
  }
};

const localRoomLists = (): RoomLists => ({ light: getLightRoomIds(), left: getLeftRoomIds() });

const storeRoomListsLocally = (lists: RoomLists) => {
  const before = localRoomLists();
  if (sameRoomLists(before, lists)) return;
  setLeftRoomIds(lists.left, false);
  setLightRoomIds(lists.light, false);
  diag(`diddy: options room lists taken from the account light=${lists.light.length} left=${lists.left.length}`);
};

const writeRoomLists = (mx: MatrixClient, lists: RoomLists) => {
  mx.setAccountData(ROOM_LISTS_EVENT as never, roomListsContent(lists) as never).catch((e) =>
    diag(`diddy: could not save the options room lists: ${e instanceof Error ? e.message : String(e)}`)
  );
};

function shareRoomLists() {
  const mx = listClient;
  if (!mx) return;
  if (!listsReconciled) {
    localChangesPending = true;
    return;
  }
  const remote = parseRoomLists(mx.getAccountData(ROOM_LISTS_EVENT as never)?.getContent());
  const local = localRoomLists();
  if (!remote || !sameRoomLists(remote, local)) writeRoomLists(mx, local);
}

const reconcileWithAccount = (mx: MatrixClient) => {
  if (listClient !== mx) return;
  const event = mx.getAccountData(ROOM_LISTS_EVENT as never);
  // before the first sync the account data may simply not be loaded yet
  if (!event && !mx.isInitialSyncComplete()) return;
  const userId = mx.getSafeUserId();
  const merged = listsReconciled ? !localChangesPending : mergedUsers().includes(userId) && !localChangesPending;
  const { next, write } = reconcileRoomLists(localRoomLists(), parseRoomLists(event?.getContent()), merged);
  listsReconciled = true;
  localChangesPending = false;
  markMerged(userId);
  storeRoomListsLocally(next);
  if (write) writeRoomLists(mx, next);
};

const onListAccountData = (event: { getType: () => string }) => {
  if (event.getType() === ROOM_LISTS_EVENT && listClient) reconcileWithAccount(listClient);
};
const onListSync = () => {
  if (listClient && !listsReconciled) reconcileWithAccount(listClient);
};

/** Keeps the message-mode and left-room lists of this device in step with the account. */
export const attachRoomListSync = (mx: MatrixClient): void => {
  if (listClient === mx) return;
  if (listClient) {
    listClient.off(ClientEvent.AccountData, onListAccountData);
    listClient.off(ClientEvent.Sync, onListSync);
  }
  listClient = mx;
  listsReconciled = false;
  localChangesPending = false;
  mx.on(ClientEvent.AccountData, onListAccountData);
  mx.on(ClientEvent.Sync, onListSync);
  reconcileWithAccount(mx);
};

export const isOptionsRoom = (room: Room | null | undefined): boolean =>
  !!room &&
  (!!room.currentState.getStateEvents(OPTIONS_MARKER_EVENT, '') || isLightOptionsRoom(room));

/** Options rooms are hidden from every room list unless Developer Tools are on. */
export const isHiddenOptionsRoom = (room: Room): boolean =>
  isOptionsRoom(room) && !isDeveloperToolsOn();

export const getOptionsRooms = (mx: MatrixClient): Room[] =>
  mx
    .getRooms()
    .filter((room) => room.getMyMembership() === 'join' && isOptionsRoom(room))
    .sort((a, b) => a.roomId.localeCompare(b.roomId));

/** The room new data is written to (stable choice when there are several). */
export const getPrimaryOptionsRoom = (mx: MatrixClient): Room | undefined => getOptionsRooms(mx)[0];

/**
 * True when the user may ban members of the options room (power level of at least the room's
 * "ban" level, 50 by default). Banning a spammer makes all their Diddy data disappear.
 */
export const canModerateOptionsRoom = (mx: MatrixClient, room: Room): boolean => {
  const me = room.getMember(mx.getSafeUserId());
  if (!me) return false;
  return room.currentState.hasSufficientPowerLevelFor('ban', me.powerLevel);
};

/** Re-renders when options rooms appear / disappear. */
export const useOptionsRooms = (mx: MatrixClient): Room[] => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onState = (event: { getType: () => string }) => {
      if (event.getType() === OPTIONS_MARKER_EVENT) bump();
    };
    mx.on(ClientEvent.Room, bump);
    mx.on(ClientEvent.DeleteRoom, bump);
    mx.on(RoomEvent.MyMembership, bump);
    mx.on(RoomStateEvent.Events, onState);
    window.addEventListener(LIGHT_ROOMS_EVENT, bump);
    return () => {
      window.removeEventListener(LIGHT_ROOMS_EVENT, bump);
      mx.off(ClientEvent.Room, bump);
      mx.off(ClientEvent.DeleteRoom, bump);
      mx.off(RoomEvent.MyMembership, bump);
      mx.off(RoomStateEvent.Events, onState);
    };
  }, [mx]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getOptionsRooms(mx), [mx, version]);
};

/** Added to the topic so other clients can find the room in a space's hierarchy (any room name). */
export const TOPIC_TAG = '[diddy-options]';

/**
 * Power levels of the options room. Every member writes their profile as state (the state key is
 * their user id, so the homeserver protects it). Badge state is admin-only: its keys are badge ids,
 * which anyone could overwrite; members send badges as messages instead (#168, badgePower.ts).
 */
export const optionsRoomPowerLevels = (creatorId: string) => ({
  users: { [creatorId]: 100 },
  events: {
    [PROFILE_EVENT]: 0,
    [BADGE_DEF_EVENT]: BADGE_STATE_LEVEL,
    [BADGE_AWARD_EVENT]: BADGE_STATE_LEVEL,
    [OPTIONS_MARKER_EVENT]: 100,
    [EventType.RoomName]: 100,
  },
});

/**
 * Power levels for createRoom. The creator gets power level 100 from the server by default, and in
 * room version 12 (current Synapse default) the creator must NOT be listed in `users` at all
 * ("Creator user ... must not appear in content.users"), so the creator entry is left out here.
 */
export const createRoomPowerLevels = (creatorId: string) => ({
  events: optionsRoomPowerLevels(creatorId).events,
});

/**
 * Creates the options room. With a space id the room becomes a child of that space and can be
 * joined by every space member (restricted join rule), so their clients can join it automatically.
 */
export const createOptionsRoom = async (
  mx: MatrixClient,
  spaceId?: string,
  name: string = OPTIONS_ROOM_NAME
): Promise<string> => {
  const me = mx.getSafeUserId();
  const initialState: { type: string; state_key: string; content: object }[] = [
    { type: OPTIONS_MARKER_EVENT, state_key: '', content: { v: 1 } },
  ];
  if (spaceId) {
    initialState.push(
      {
        type: EventType.SpaceParent,
        state_key: spaceId,
        content: { via: [mx.getDomain() ?? ''], canonical: true },
      },
      {
        type: EventType.RoomJoinRules,
        state_key: '',
        content: {
          join_rule: 'restricted',
          allow: [{ type: 'm.room_membership', room_id: spaceId }],
        },
      }
    );
  }
  const { room_id: roomId } = await mx.createRoom({
    name: name.trim() || OPTIONS_ROOM_NAME,
    topic: `Used by Diddy clients to share profiles and badges. Please do not rename or delete. ${TOPIC_TAG}`,
    visibility: Visibility.Private,
    preset: Preset.PrivateChat,
    initial_state: initialState as never,
    power_level_content_override: createRoomPowerLevels(me) as never,
  });
  if (spaceId) {
    await mx
      .sendStateEvent(
        spaceId,
        EventType.SpaceChild as never,
        { via: [mx.getDomain() ?? ''], suggested: false } as never,
        roomId
      )
      .catch((e) => {
        // the room exists and works without the space child entry, so do not fail
        // eslint-disable-next-line no-console
        console.warn('Diddy: could not add the options room to the space', e);
      });
  }
  return roomId;
};

/**
 * Turns an existing room into the options room: adds the marker event and lets everyone write their
 * profile (badge state stays admin-only, see optionsRoomPowerLevels). Needs permission to change power levels / state in that room.
 */
export const adoptRoomAsOptionsRoom = async (
  mx: MatrixClient,
  roomId: string,
  tagTopic: boolean
): Promise<void> => {
  const room = mx.getRoom(roomId);
  if (!room) throw new Error('Room not found.');
  const powerLevelsEvent = room.currentState.getStateEvents(EventType.RoomPowerLevels, '');
  if (!powerLevelsEvent) {
    throw new Error("Could not read this room's permissions yet. Try again in a moment.");
  }
  const powerLevels = powerLevelsEvent.getContent() ?? {};
  const events = {
    ...(powerLevels.events ?? {}),
    [PROFILE_EVENT]: 0,
    [BADGE_DEF_EVENT]: BADGE_STATE_LEVEL,
    [BADGE_AWARD_EVENT]: BADGE_STATE_LEVEL,
  };
  try {
    await mx.sendStateEvent(
      roomId,
      EventType.RoomPowerLevels as never,
      { ...powerLevels, events } as never,
      ''
    );
    await mx.sendStateEvent(roomId, OPTIONS_MARKER_EVENT as never, { v: 1 } as never, '');
  } catch (e) {
    throw new Error(
      `Could not use this room: you need permission to change its settings. (${
        e instanceof Error ? e.message : String(e)
      })`
    );
  }
  if (tagTopic) {
    const topic =
      room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent()?.topic ?? '';
    if (!topic.includes(TOPIC_TAG)) {
      await mx
        .sendStateEvent(
          roomId,
          EventType.RoomTopic as never,
          { topic: `${topic} ${TOPIC_TAG}`.trim() } as never,
          ''
        )
        .catch(() => {});
    }
  }
};

/** Joins the options room of a space (a child named OPTIONS_ROOM_NAME) if there is one. */
export const joinOptionsRoomOfSpace = async (mx: MatrixClient, spaceId: string): Promise<void> => {
  const MAX_PAGES = 5;
  let fromToken: string | undefined;
  let space: IHierarchyRoom | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const hierarchy = await getHierarchyPage(mx, spaceId, fromToken);
    space = space ?? hierarchy.rooms.find((r) => r.room_id === spaceId);
    const candidate = hierarchy.rooms.find((r) => {
      if (r.room_id === spaceId) return false;
      if (!(r.name === OPTIONS_ROOM_NAME || (r.topic ?? '').includes(TOPIC_TAG))) return false;
      const membership = mx.getRoom(r.room_id)?.getMyMembership();
      if (membership === 'join' || membership === 'ban') return false;
      if (wasLeftOnPurpose(r.room_id)) return false;
      return true;
    });
    if (candidate) {
      const via = space?.children_state.find(
        (c) => (c as { state_key?: string }).state_key === candidate.room_id
      )?.content?.via;
      const serverPart = candidate.room_id.split(':').slice(1).join(':');
      const viaServers = via && via.length > 0 ? via : serverPart ? [serverPart] : undefined;
      // eslint-disable-next-line no-await-in-loop
      await mx.joinRoom(candidate.room_id, { viaServers });
      return;
    }
    if (!hierarchy.next_batch) return;
    fromToken = hierarchy.next_batch;
  }
};

/**
 * Joined rooms that are clearly meant as a Diddy room (named like the options room or tagged in
 * the topic) but carry no marker: an admin made them in another client, or Diddy may not change
 * their settings. They are used in message mode right away, the same as "Connect" in the welcome
 * guide, so nobody has to click anything. Rooms you removed or left on purpose stay untouched.
 * Never changes a room's settings. Returns how many rooms were connected.
 */
export const connectMarkedRooms = (mx: MatrixClient): number => {
  let connected = 0;
  mx.getRooms().forEach((room) => {
    if (room.getMyMembership() !== 'join' || room.isSpaceRoom() || isOptionsRoom(room)) return;
    // the room's state is not loaded yet: a marker could still be missing only here
    if (!room.currentState.getStateEvents(EventType.RoomPowerLevels, '')) return;
    if (wasLeftOnPurpose(room.roomId)) return;
    const name = room.currentState.getStateEvents(EventType.RoomName, '')?.getContent()?.name;
    const topic = room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent()?.topic;
    const named = typeof name === 'string' && name.trim().toLowerCase() === OPTIONS_ROOM_NAME.toLowerCase();
    const tagged = typeof topic === 'string' && topic.includes(TOPIC_TAG);
    if (!named && !tagged) return;
    addLightOptionsRoom(room.roomId);
    diag(`diddy: marked room connected automatically room=${room.roomId}`);
    connected += 1;
  });
  return connected;
};

/**
 * Whether a space already has a Diddy room among its rooms (named like the options room or tagged
 * in the topic, joined or not). Undefined when its rooms could not be read completely.
 */
const spaceHasDiddyRoom = async (mx: MatrixClient, spaceId: string): Promise<boolean | undefined> => {
  const MAX_PAGES = 5;
  let fromToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let hierarchy: Awaited<ReturnType<typeof getHierarchyPage>>;
    try {
      // eslint-disable-next-line no-await-in-loop
      hierarchy = await getHierarchyPage(mx, spaceId, fromToken);
    } catch {
      return undefined;
    }
    const found = hierarchy.rooms.some(
      (r) =>
        r.room_id !== spaceId &&
        (r.name?.trim().toLowerCase() === OPTIONS_ROOM_NAME.toLowerCase() || (r.topic ?? '').includes(TOPIC_TAG))
    );
    if (found) return true;
    if (!hierarchy.next_batch) return false;
    fromToken = hierarchy.next_batch;
  }
  return undefined;
};

/**
 * Creates the options room of a space you created yourself when it has none (autoCreate.ts), so
 * the other members' Diddy joins it by itself. True when a room was made.
 */
export const createOptionsRoomIfMissing = async (mx: MatrixClient, spaceId: string): Promise<boolean> => {
  const space = mx.getRoom(spaceId);
  if (!space || !space.isSpaceRoom() || space.getMyMembership() !== 'join') return false;
  const me = mx.getSafeUserId();
  const createEvent = space.currentState.getStateEvents(EventType.RoomCreate, '');
  const facts = {
    isCreator: !!createEvent && createEvent.getSender() === me,
    canAddRooms: space.currentState.maySendStateEvent(EventType.SpaceChild, me),
    joinedMembers: space.getJoinedMemberCount(),
    claimed: spaceId in parseAutoCreated(mx.getAccountData(AUTO_CREATED_EVENT as never)?.getContent()),
  };
  // cheap checks first: the hierarchy is only asked for spaces that may get a room
  if (!shouldAutoCreate({ ...facts, hasDiddyRoom: false })) return false;
  const hasDiddyRoom = await spaceHasDiddyRoom(mx, spaceId);
  // read again: another device may have claimed the space meanwhile
  const claimed = parseAutoCreated(mx.getAccountData(AUTO_CREATED_EVENT as never)?.getContent());
  if (!shouldAutoCreate({ ...facts, claimed: spaceId in claimed, hasDiddyRoom })) return false;
  const at = Date.now();
  // claimed before the room exists: a second device or a later run never makes another one
  await mx.setAccountData(AUTO_CREATED_EVENT as never, autoCreatedContent(claimed, spaceId, { at }) as never);
  const roomId = await createOptionsRoom(mx, spaceId);
  diag(`diddy: options room created automatically space=${spaceId} room=${roomId}`);
  const latest = parseAutoCreated(mx.getAccountData(AUTO_CREATED_EVENT as never)?.getContent());
  await mx
    .setAccountData(AUTO_CREATED_EVENT as never, autoCreatedContent(latest, spaceId, { at, roomId }) as never)
    .catch(() => {});
  return true;
};
