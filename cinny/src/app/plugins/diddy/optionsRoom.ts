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

export const isOptionsRoom = (room: Room | null | undefined): boolean =>
  !!room?.currentState.getStateEvents(OPTIONS_MARKER_EVENT, '');

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
    return () => {
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
      .catch(() => {});
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
  const powerLevels = room.currentState.getStateEvents(EventType.RoomPowerLevels, '')?.getContent() ?? {};
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
  const hierarchy = await mx.getRoomHierarchy(spaceId, 50, 1);
  const candidate = hierarchy.rooms.find(
    (r) =>
      r.room_id !== spaceId &&
      (r.name === OPTIONS_ROOM_NAME || (r.topic ?? '').includes(TOPIC_TAG)) &&
      mx.getRoom(r.room_id)?.getMyMembership() !== 'join'
  );
  if (!candidate) return;
  await mx.joinRoom(candidate.room_id, { viaServers: candidate.children_state?.[0]?.content?.via });
};
