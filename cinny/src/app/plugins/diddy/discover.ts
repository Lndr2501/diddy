/**
 * Finds the rooms inside the user's joined spaces, including rooms the user has not joined yet,
 * so a second account can pick (and join) the shared Diddy Options room.
 */
import type { MatrixClient } from 'matrix-js-sdk';
import { OPTIONS_ROOM_NAME } from './types';

export type DiscoveredRoom = {
  roomId: string;
  name: string;
  spaceId: string;
  spaceName: string;
  joined: boolean;
  encrypted?: boolean;
  topic?: string;
  via?: string[];
};

const MAX_PAGES = 3;
const DIDDY_TOPIC_TAG = '[diddy-options]';

/** True when the name or topic marks a room as the Diddy options room. */
export const looksLikeDiddyRoom = (name?: string, topic?: string): boolean =>
  (name ?? '').trim() === OPTIONS_ROOM_NAME || (topic ?? '').includes(DIDDY_TOPIC_TAG);

export const discoverSpaceRooms = async (mx: MatrixClient): Promise<DiscoveredRoom[]> => {
  const spaces = mx
    .getRooms()
    .filter((room) => room.isSpaceRoom() && room.getMyMembership() === 'join');

  const perSpace = await Promise.all(
    spaces.map(async (space): Promise<DiscoveredRoom[]> => {
      const found: DiscoveredRoom[] = [];
      try {
        let fromToken: string | undefined;
        let spaceEntryChildren: { state_key?: string; content?: { via?: string[] } }[] | undefined;
        for (let page = 0; page < MAX_PAGES; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const hierarchy = await mx.getRoomHierarchy(space.roomId, 100, 1, false, fromToken);
          const own = hierarchy.rooms.find((r) => r.room_id === space.roomId);
          if (own && !spaceEntryChildren) {
            spaceEntryChildren = own.children_state as unknown as {
              state_key?: string;
              content?: { via?: string[] };
            }[];
          }
          hierarchy.rooms.forEach((r) => {
            if (r.room_id === space.roomId) return;
            if ((r as { room_type?: string }).room_type === 'm.space') return;
            const local = mx.getRoom(r.room_id);
            const joined = local?.getMyMembership() === 'join';
            const child = spaceEntryChildren?.find(
              (c) => (c as { state_key?: string }).state_key === r.room_id
            );
            const via = child?.content?.via;
            found.push({
              roomId: r.room_id,
              name: (joined ? local?.name : undefined) || r.name || r.canonical_alias || r.room_id,
              spaceId: space.roomId,
              spaceName: space.name,
              joined,
              encrypted: local ? mx.isRoomEncrypted(r.room_id) : undefined,
              topic: r.topic,
              via: via && via.length > 0 ? via : undefined,
            });
          });
          if (!hierarchy.next_batch) break;
          fromToken = hierarchy.next_batch;
        }
      } catch {
        // ignore errors of single spaces (no permission, federation problems, ...)
      }
      return found;
    })
  );

  // a room can be a child of several spaces: keep the first entry
  const seen = new Set<string>();
  const result: DiscoveredRoom[] = [];
  perSpace.flat().forEach((entry) => {
    if (seen.has(entry.roomId)) return;
    seen.add(entry.roomId);
    result.push(entry);
  });
  return result;
};
