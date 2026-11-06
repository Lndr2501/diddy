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

const setLightRoomIds = (ids: string[]) => {
  try {
    localStorage.setItem(LIGHT_ROOMS_KEY, JSON.stringify(ids));
  } catch {
    // ignore (storage full / unavailable)
  }
  window.dispatchEvent(new CustomEvent(LIGHT_ROOMS_EVENT));
};

export const addLightOptionsRoom = (roomId: string): void => {
  const ids = getLightRoomIds();
  if (!ids.includes(roomId)) ids.push(roomId);
  setLightRoomIds(ids);
};

export const removeLightOptionsRoom = (roomId: string): void => {
  setLightRoomIds(getLightRoomIds().filter((id) => id !== roomId));
};

export const isLightOptionsRoom = (room: Room | null | undefined): boolean =>
  !!room && getLightRoomIds().includes(room.roomId);

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

/** Call when the user leaves an options room themselves: it will not be auto-joined again. */
export const rememberLeftOptionsRoom = (roomId: string): void => {
  const ids = getLeftRoomIds();
  if (ids.includes(roomId)) return;
  ids.push(roomId);
  try {
    localStorage.setItem(LEFT_ROOMS_KEY, JSON.stringify(ids));
  } catch {
    // ignore (storage full / unavailable)
  }
};

export const wasLeftOnPurpose = (roomId: string): boolean => getLeftRoomIds().includes(roomId);

export const isOptionsRoom = (room: Room | null | undefined): boolean =>
  !!room && (!!room.currentState.getStateEvents(OPTIONS_MARKER_EVENT, '') || isLightOptionsRoom(room));

/** Options rooms are hidden from every room list unless Developer Tools are on. */
export const isHiddenOptionsRoom = (room: Room): boolean =>
  isOptionsRoom(room) && !isDeveloperToolsOn();

export const getOptionsRooms = (mx: MatrixClient): Room[] =>
  mx
    .getRooms()
    .filter((room) => room.getMyMembership() === 'join' && isOptionsRoom(room))
    .sort((a, b) => a.roomId.localeCompare(b.roomId));

/** The room new data is written to (stable choice when there are several). */
export const getPrimaryOptionsRoom = (mx: MatrixClient): Room | undefined =>
  getOptionsRooms(mx)[0];

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

/** Power levels that let every member write the Diddy event types (each user only their own key). */
export const optionsRoomPowerLevels = (creatorId: string) => ({
  users: { [creatorId]: 100 },
  events: {
    [PROFILE_EVENT]: 0,
    [BADGE_DEF_EVENT]: 0,
    [BADGE_AWARD_EVENT]: 0,
    [OPTIONS_MARKER_EVENT]: 100,
    [EventType.RoomName]: 100,
  },
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
        content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: spaceId }] },
      }
    );
  }
  const { room_id: roomId } = await mx.createRoom({
    name: name.trim() || OPTIONS_ROOM_NAME,
    topic: `Used by Diddy clients to share profiles and badges. Please do not rename or delete. ${TOPIC_TAG}`,
    visibility: Visibility.Private,
    preset: Preset.PrivateChat,
    initial_state: initialState as never,
    power_level_content_override: optionsRoomPowerLevels(me) as never,
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
 * Turns an existing room into the options room: adds the marker event and lets everyone write the
 * Diddy event types. Needs permission to change power levels / state in that room.
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
    throw new Error('Could not read this room\'s permissions yet. Try again in a moment.');
  }
  const powerLevels = powerLevelsEvent.getContent() ?? {};
  const events = {
    ...(powerLevels.events ?? {}),
    [PROFILE_EVENT]: 0,
    [BADGE_DEF_EVENT]: 0,
    [BADGE_AWARD_EVENT]: 0,
  };
  try {
    await mx.sendStateEvent(roomId, EventType.RoomPowerLevels as never, { ...powerLevels, events } as never, '');
    await mx.sendStateEvent(roomId, OPTIONS_MARKER_EVENT as never, { v: 1 } as never, '');
  } catch (e) {
    throw new Error(
      `Could not use this room: you need permission to change its settings. (${
        e instanceof Error ? e.message : String(e)
      })`
    );
  }
  if (tagTopic) {
    const topic = room.currentState.getStateEvents(EventType.RoomTopic, '')?.getContent()?.topic ?? '';
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
    const hierarchy = await mx.getRoomHierarchy(spaceId, 50, 1, false, fromToken);
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
      const via = space?.children_state.find((c) => (c as { state_key?: string }).state_key === candidate.room_id)?.content?.via;
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
