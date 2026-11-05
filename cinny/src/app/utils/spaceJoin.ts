import { MatrixClient } from 'matrix-js-sdk';
import { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';

/**
 * Discord-like space behaviour: join every room of a space in one go, or automatically whenever a
 * new room shows up in a space you opted in for.
 */

// Rooms a space member may join without an invite.
const JOINABLE_RULES = new Set(['public', 'restricted', 'knock_restricted']);
const MAX_HIERARCHY_PAGES = 40;
const SPACE_TYPE = 'm.space';

export type SpaceRoomsSnapshot = {
  rooms: IHierarchyRoom[];
  via: Map<string, string[]>;
};

/** Loads the complete room tree of a space (all pages, all sub-spaces). */
export const fetchSpaceRooms = async (
  mx: MatrixClient,
  spaceId: string
): Promise<SpaceRoomsSnapshot> => {
  const rooms: IHierarchyRoom[] = [];
  let nextBatch: string | undefined;

  for (let page = 0; page < MAX_HIERARCHY_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await mx.getRoomHierarchy(spaceId, 50, undefined, false, nextBatch);
    rooms.push(...res.rooms);
    nextBatch = res.next_batch;
    if (!nextBatch) break;
  }

  const via = new Map<string, string[]>();
  rooms.forEach((room) =>
    room.children_state?.forEach((child) => {
      const servers = (child.content as { via?: unknown })?.via;
      if (Array.isArray(servers) && servers.length > 0) {
        via.set(child.state_key, servers as string[]);
      }
    })
  );

  return { rooms: rooms.filter((room) => room.room_id !== spaceId), via };
};

const isMember = (mx: MatrixClient, roomId: string): boolean =>
  mx.getRoom(roomId)?.getMyMembership() === 'join';

/** Rooms of the snapshot that can be joined and are not joined yet. */
export const getJoinableRooms = (mx: MatrixClient, rooms: IHierarchyRoom[]): IHierarchyRoom[] =>
  rooms.filter((room) => {
    if (!JOINABLE_RULES.has(room.join_rule ?? '')) return false;
    const membership = mx.getRoom(room.room_id)?.getMyMembership();
    return membership !== 'join' && membership !== 'ban';
  });

export type JoinSummary = {
  joined: string[];
  failed: string[];
};

/** Joins the given rooms one by one (sub-spaces first, so restricted rooms inside them work). */
export const joinRooms = async (
  mx: MatrixClient,
  rooms: IHierarchyRoom[],
  via: Map<string, string[]>
): Promise<JoinSummary> => {
  const ordered = [...rooms].sort(
    (a, b) => Number(b.room_type === SPACE_TYPE) - Number(a.room_type === SPACE_TYPE)
  );
  const joined: string[] = [];

  const attempt = async (room: IHierarchyRoom): Promise<boolean> => {
    try {
      await mx.joinRoom(room.room_id, { viaServers: via.get(room.room_id) });
      joined.push(room.room_id);
      return true;
    } catch {
      return false;
    }
  };

  const failedFirstPass: IHierarchyRoom[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await attempt(ordered[i]))) failedFirstPass.push(ordered[i]);
  }

  // A room can become joinable once its sub-space was joined: give failures a second chance.
  const failed: string[] = [];
  for (let i = 0; i < failedFirstPass.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await attempt(failedFirstPass[i]))) failed.push(failedFirstPass[i].room_id);
  }

  return { joined, failed };
};

export const joinAllSpaceRooms = async (
  mx: MatrixClient,
  spaceId: string
): Promise<JoinSummary & { alreadyJoined: boolean }> => {
  const { rooms, via } = await fetchSpaceRooms(mx, spaceId);
  const joinable = getJoinableRooms(mx, rooms);
  if (joinable.length === 0) return { joined: [], failed: [], alreadyJoined: true };
  const summary = await joinRooms(mx, joinable, via);
  return { ...summary, alreadyJoined: false };
};

// ---------------------------------------------------------------------------------------------
// Auto-join. Per space we remember which child rooms we have already seen. Turning it on joins
// everything that exists; afterwards only rooms that are NEW to the space are joined, so a room
// you left on purpose is not pulled back in.
// ---------------------------------------------------------------------------------------------

export const AUTO_JOIN_CHANGE_EVENT = 'cinny-auto-join-change';

type AutoJoinStore = Record<string, string[]>;

const storeKey = (mx: MatrixClient) => `autoJoinSpaces:${mx.getSafeUserId()}`;

export const readAutoJoinStore = (mx: MatrixClient): AutoJoinStore => {
  try {
    const raw = localStorage.getItem(storeKey(mx));
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as AutoJoinStore) : {};
  } catch {
    return {};
  }
};

const writeAutoJoinStore = (mx: MatrixClient, store: AutoJoinStore) => {
  localStorage.setItem(storeKey(mx), JSON.stringify(store));
  window.dispatchEvent(new Event(AUTO_JOIN_CHANGE_EVENT));
};

export const setSpaceAutoJoin = (mx: MatrixClient, spaceId: string, enabled: boolean) => {
  const store = readAutoJoinStore(mx);
  if (enabled) {
    if (store[spaceId]) return;
    store[spaceId] = [];
  } else {
    delete store[spaceId];
  }
  writeAutoJoinStore(mx, store);
};

const running = new Set<string>();

/** Joins rooms that are new in `spaceId` since the last run. No-op if auto-join is off. */
export const runSpaceAutoJoin = async (mx: MatrixClient, spaceId: string): Promise<void> => {
  const known = readAutoJoinStore(mx)[spaceId];
  if (!known || running.has(spaceId) || !isMember(mx, spaceId)) return;

  running.add(spaceId);
  try {
    const { rooms, via } = await fetchSpaceRooms(mx, spaceId);
    const knownSet = new Set(known);
    const fresh = rooms.filter((room) => !knownSet.has(room.room_id));
    const { failed } = await joinRooms(mx, getJoinableRooms(mx, fresh), via);

    // Remember everything we've seen, except failures, which get retried on the next run.
    const failedSet = new Set(failed);
    const store = readAutoJoinStore(mx);
    const next = rooms.map((r) => r.room_id).filter((id) => !failedSet.has(id));
    const unchanged =
      next.length === known.length && next.every((id) => knownSet.has(id));
    // Only write on change: every write notifies listeners, which would trigger another run.
    if (store[spaceId] && !unchanged) {
      store[spaceId] = next;
      writeAutoJoinStore(mx, store);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[auto-join] failed for space', spaceId, e);
  } finally {
    running.delete(spaceId);
  }
};
