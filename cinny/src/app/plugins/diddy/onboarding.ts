/**
 * Welcome guide / "this server uses Diddy" prompt: detecting Diddy rooms in the user's spaces,
 * remembering what was shown and deciding when to show it. The UI is features/onboarding.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MatrixClient, Room } from 'matrix-js-sdk';
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';
import { OPTIONS_ROOM_NAME } from './types';
import { TOPIC_TAG, isOptionsRoom } from './optionsRoom';

export type DiddyRoomInfo = {
  roomId: string;
  name: string;
  spaceId: string;
  spaceName: string;
  joined: boolean;
  via?: string[];
};

const MAX_PAGES = 3;
const SCAN_INTERVAL_MS = 10 * 60 * 1000;
const SYNC_POLL_MS = 2000;
const CHANGE_EVENT = 'diddy-onboarding-change';

const hasMarkerText = (text: string | undefined): boolean => !!text && text.includes(TOPIC_TAG);

const nameMatches = (name: string | undefined): boolean =>
  !!name && name.trim().toLowerCase() === OPTIONS_ROOM_NAME.toLowerCase();

/**
 * True if the room looks like a Diddy room: it is named like the options room, its topic carries
 * the tag, or an already loaded message starts with the tag.
 */
export const isDiddyMarkedRoom = (room: Room): boolean => {
  if (nameMatches(room.name)) return true;
  const topic = room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic;
  if (typeof topic === 'string' && hasMarkerText(topic)) return true;
  const events = room.getLiveTimeline().getEvents();
  return events.some((ev) => {
    if (ev.getType() !== 'm.room.message') return false;
    const body = ev.getContent()?.body;
    return typeof body === 'string' && body.trimStart().startsWith(TOPIC_TAG);
  });
};

const getJoinedSpaces = (mx: MatrixClient): Room[] =>
  mx.getRooms().filter((r) => r.isSpaceRoom() && r.getMyMembership() === 'join');

/** Finds Diddy rooms in the joined spaces (hierarchy, so also rooms the user has not joined). */
export const findDiddyRoomsInSpaces = async (mx: MatrixClient): Promise<DiddyRoomInfo[]> => {
  const found = new Map<string, DiddyRoomInfo>();
  const spaces = getJoinedSpaces(mx);

  const joinedState = (roomId: string): boolean => mx.getRoom(roomId)?.getMyMembership() === 'join';

  await Promise.all(
    spaces.map(async (space) => {
      try {
        let fromToken: string | undefined;
        let spaceRoom: IHierarchyRoom | undefined;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const hierarchy = await mx.getRoomHierarchy(space.roomId, 100, 1, false, fromToken);
          spaceRoom = spaceRoom ?? hierarchy.rooms.find((r) => r.room_id === space.roomId);
          hierarchy.rooms.forEach((r) => {
            if (r.room_id === space.roomId) return;
            if (!(nameMatches(r.name) || hasMarkerText(r.topic))) return;
            if (found.has(r.room_id)) return;
            const childEvent = spaceRoom?.children_state.find(
              (c) => (c as { state_key?: string }).state_key === r.room_id
            );
            const via = childEvent?.content?.via;
            const serverPart = r.room_id.split(':').slice(1).join(':');
            found.set(r.room_id, {
              roomId: r.room_id,
              name: r.name ?? OPTIONS_ROOM_NAME,
              spaceId: space.roomId,
              spaceName: space.name,
              joined: joinedState(r.room_id),
              via: via && via.length > 0 ? via : serverPart ? [serverPart] : undefined,
            });
          });
          if (!hierarchy.next_batch) break;
          fromToken = hierarchy.next_batch;
        }
      } catch {
        // ignore: the server may not support the hierarchy API or the space is not reachable
      }
    })
  );

  // joined rooms that are recognisable as Diddy rooms even without a hierarchy hit
  const parentOf = new Map<string, Room>();
  spaces.forEach((space) => {
    space.currentState.getStateEvents('m.space.child').forEach((ev) => {
      const key = ev.getStateKey();
      if (key && Object.keys(ev.getContent() ?? {}).length > 0) parentOf.set(key, space);
    });
  });
  mx.getRooms().forEach((room) => {
    if (room.getMyMembership() !== 'join' || room.isSpaceRoom()) return;
    if (found.has(room.roomId)) return;
    if (!isDiddyMarkedRoom(room)) return;
    const parent = parentOf.get(room.roomId);
    found.set(room.roomId, {
      roomId: room.roomId,
      name: room.name,
      spaceId: parent?.roomId ?? '',
      spaceName: parent?.name ?? '',
      joined: true,
    });
  });

  return Array.from(found.values());
};

// --- persistence -------------------------------------------------------------------------------

export type OnboardingStored = { done: boolean; dismissedSpaces: string[] };

const storageKey = (userId: string) => `diddyOnboarding:${userId}`;

export const readOnboarding = (userId: string): OnboardingStored => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { done: false, dismissedSpaces: [] };
    const parsed = JSON.parse(raw) as Partial<OnboardingStored>;
    return {
      done: parsed.done === true,
      dismissedSpaces: Array.isArray(parsed.dismissedSpaces)
        ? parsed.dismissedSpaces.filter((s): s is string => typeof s === 'string')
        : [],
    };
  } catch {
    return { done: false, dismissedSpaces: [] };
  }
};

const writeOnboarding = (userId: string, data: OnboardingStored): void => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data));
  } catch {
    // storage full or blocked: the guide may show again, acceptable
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const markOnboardingDone = (userId: string): void => {
  writeOnboarding(userId, { ...readOnboarding(userId), done: true });
};

export const dismissOnboardingSpaces = (userId: string, keys: string[]): void => {
  const current = readOnboarding(userId);
  const dismissedSpaces = Array.from(new Set([...current.dismissedSpaces, ...keys]));
  writeOnboarding(userId, { ...current, dismissedSpaces });
};

/** Shows the Welcome guide again (it appears on the next check, within seconds). */
export const resetDiddyOnboarding = (userId: string): void => {
  writeOnboarding(userId, { done: false, dismissedSpaces: [] });
};

/** Key used for "Not now": the space, or the room itself when it is not in a joined space. */
export const dismissKeyOf = (room: DiddyRoomInfo): string => room.spaceId || room.roomId;

/** A Diddy room the user has not joined or is not using for profiles yet. */
const isPending = (mx: MatrixClient, info: DiddyRoomInfo): boolean => {
  const room = mx.getRoom(info.roomId);
  if (!room || room.getMyMembership() !== 'join') return true;
  return !isOptionsRoom(room);
};

// --- hook --------------------------------------------------------------------------------------

export type DiddyOnboardingState = {
  show: 'welcome' | 'server' | undefined;
  /** welcome: all Diddy rooms found; server: only the ones still to join */
  rooms: DiddyRoomInfo[];
};

export const useDiddyOnboardingState = (mx: MatrixClient): DiddyOnboardingState => {
  const userId = mx.getUserId() ?? '';
  const [synced, setSynced] = useState(() => mx.isInitialSyncComplete());
  const [stored, setStored] = useState<OnboardingStored>(() => readOnboarding(userId));
  const [found, setFound] = useState<DiddyRoomInfo[]>([]);
  const scanning = useRef(false);

  // wait until the first sync is complete
  useEffect(() => {
    if (synced) return undefined;
    const timer = window.setInterval(() => {
      if (mx.isInitialSyncComplete()) setSynced(true);
    }, SYNC_POLL_MS);
    return () => window.clearInterval(timer);
  }, [mx, synced]);

  // follow changes of the stored state (done / dismissed / reset)
  useEffect(() => {
    setStored(readOnboarding(userId));
    const onChange = () => setStored(readOnboarding(userId));
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [userId]);

  const scan = useCallback(async () => {
    if (scanning.current) return;
    scanning.current = true;
    try {
      const result = await findDiddyRoomsInSpaces(mx);
      setFound(result);
    } catch {
      // ignore
    } finally {
      scanning.current = false;
    }
  }, [mx]);

  // scan at sync completion, then every 10 minutes
  useEffect(() => {
    if (!synced || !userId) return undefined;
    scan();
    const timer = window.setInterval(scan, SCAN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [synced, userId, scan]);

  if (!synced || !userId) return { show: undefined, rooms: [] };
  if (!stored.done) return { show: 'welcome', rooms: found };

  const pending = found.filter(
    (info) => isPending(mx, info) && !stored.dismissedSpaces.includes(dismissKeyOf(info))
  );
  if (pending.length > 0) return { show: 'server', rooms: pending };
  return { show: undefined, rooms: [] };
};
