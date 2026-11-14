/**
 * Pure helpers for the stored Diddy history of options rooms (backfillCache.ts). No imports, so the
 * unit tests can load this file directly.
 */

/** A stored event: the clear (decrypted) event as the server sent it, reduced to what Diddy reads. */
export type StoredEvent = {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts: number;
  content: Record<string, unknown>;
  /** how many room events were newer than this one when it was stored (for the "recent" rule) */
  depth?: number;
};

export const MAX_STORED_EVENTS = 2000;

/**
 * The part of a backward page that is newer than what was read last time: everything before the
 * event `stopId` (newest first). `reached` tells whether the old history was met, so no further
 * page is needed.
 */
export const takeUntil = <T extends { event_id?: string }>(
  chunk: T[],
  stopId: string | undefined
): { events: T[]; reached: boolean } => {
  if (!stopId) return { events: chunk, reached: false };
  const index = chunk.findIndex((e) => e.event_id === stopId);
  if (index < 0) return { events: chunk, reached: false };
  return { events: chunk.slice(0, index), reached: true };
};

/**
 * Old and new events together, one per event id, newest `max` kept (newest first). `newerCount`
 * events arrived above the old ones, so they move that much deeper.
 */
export const mergeStored = (
  old: StoredEvent[],
  added: StoredEvent[],
  max = MAX_STORED_EVENTS,
  newerCount = 0
): StoredEvent[] => {
  const byId = new Map<string, StoredEvent>();
  added.forEach((e) => {
    if (!byId.has(e.event_id)) byId.set(e.event_id, e);
  });
  old.forEach((e) => {
    if (!byId.has(e.event_id)) byId.set(e.event_id, { ...e, depth: (e.depth ?? max) + newerCount });
  });
  return Array.from(byId.values())
    .sort((a, b) => b.origin_server_ts - a.origin_server_ts)
    .slice(0, max);
};
