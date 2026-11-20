/** A row of the virtualized room lists (Home, Direct): a category header or a room. */
export type RoomNavRow = { type: 'category'; id: string } | { type: 'room'; roomId: string };

/**
 * A stable key for a room list row, for the virtualizer's `getItemKey`.
 *
 * The rows are keyed by room in React, so a chat moving up keeps its DOM node and is not measured
 * again. The virtualizer keeps the measured heights by this key; with the default (the index) a
 * room with a call member list underneath kept the height of its old position and covered the rows
 * below it, while its old position stayed tall and left a gap (#262).
 */
export function roomNavRowKey(row: RoomNavRow | undefined, index: number): string | number {
  if (!row) return index;
  return row.type === 'category' ? `category:${row.id}` : `room:${row.roomId}`;
}
