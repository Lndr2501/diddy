/**
 * Which rooms are Diddy options rooms without the marker ("message mode", picked in the profile
 * editor or the welcome guide), and which options rooms you left on purpose, shared by all devices
 * of the account.
 *
 * Both lists used to live only in the device's own storage. A phone then did not read (or write)
 * the room the desktop used, so the two showed different profiles and wrote into different rooms.
 * They are kept in the account data event ROOM_LISTS_EVENT now; iOS reads and writes the same one.
 *
 * Rules (pure, no Matrix calls, tested in tests/roomListSync.test.cjs):
 *  - nothing stored on the account yet: this device's lists are written there
 *  - first time this device sees the stored lists: both are joined (nothing a device knew is lost)
 *  - afterwards the stored lists win, so a room removed on one device is removed everywhere
 */

export const ROOM_LISTS_EVENT = 'app.diddy.options_rooms';

export type RoomLists = { light: string[]; left: string[] };

const MAX_IDS = 200;

const cleanIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  value.forEach((id) => {
    if (typeof id !== 'string' || !id.startsWith('!') || id.length > 255) return;
    if (!out.includes(id)) out.push(id);
  });
  // the newest entries are at the end and are the ones kept
  return out.slice(-MAX_IDS);
};

/** The lists stored on the account, or undefined when there are none (or they are unreadable). */
export const parseRoomLists = (content: unknown): RoomLists | undefined => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const c = content as Record<string, unknown>;
  if (!Array.isArray(c.light) && !Array.isArray(c.left)) return undefined;
  return { light: cleanIds(c.light), left: cleanIds(c.left) };
};

export const roomListsContent = (lists: RoomLists): RoomLists & { v: 1 } => ({
  v: 1,
  light: cleanIds(lists.light),
  left: cleanIds(lists.left),
});

const sameIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

export const sameRoomLists = (a: RoomLists, b: RoomLists): boolean =>
  sameIds(a.light, b.light) && sameIds(a.left, b.left);

/**
 * What this device keeps (`next`) and whether the account data has to be written (`write`).
 * `merged`: this device already joined its lists with the stored ones once.
 */
export const reconcileRoomLists = (
  local: RoomLists,
  remote: RoomLists | undefined,
  merged: boolean
): { next: RoomLists; write: boolean } => {
  const mine = { light: cleanIds(local.light), left: cleanIds(local.left) };
  if (!remote) {
    return { next: mine, write: mine.light.length > 0 || mine.left.length > 0 };
  }
  if (merged) return { next: remote, write: false };
  const union = (a: string[], b: string[]) => cleanIds([...b, ...a.filter((id) => !b.includes(id))]);
  const next = { light: union(mine.light, remote.light), left: union(mine.left, remote.left) };
  return { next, write: !sameRoomLists(next, remote) };
};
