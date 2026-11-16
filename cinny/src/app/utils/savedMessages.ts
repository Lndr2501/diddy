// Saved messages (bookmarks), kept in the account data so every device of yours shows the same list.
//
// The account data is not encrypted, so it holds only where a message is (room and event id) and
// when it was saved, never what it says. The view loads the message itself by id.
//
// Two devices can change the list at the same time. Each one reads the newest list from the
// server before writing and merges it with what it has; removals leave a short-lived marker
// (`removed`) so a merge does not bring a removed message back. Per message the newer of "saved"
// and "removed" wins. iOS has the same rules in ios/Diddy/Matrix/SavedMessagesLogic.swift.

import { replyPreviewText } from './replyPreview';

export const SAVED_MESSAGES_TYPE = 'app.diddy.saved_messages';

/** At most this many saved (300 plus markers stay well under the 64 KB event limit) messages; saving one more asks you to remove some first. */
export const SAVED_MESSAGES_LIMIT = 300;
/** Removal markers older than this are dropped. */
export const SAVED_REMOVED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
/** At most this many removal markers, the newest. */
export const SAVED_REMOVED_LIMIT = 100;

export type SavedMessage = { room_id: string; event_id: string; saved_ts: number };
export type RemovedMessage = { room_id: string; event_id: string; removed_ts: number };

/** The list as it is stored and as the app works with it: saved newest first. */
export type SavedMessagesState = {
  saved: SavedMessage[];
  removed: RemovedMessage[];
};

export type SavedMessagesContent = SavedMessagesState & { version: 1 };

export const emptySavedMessages = (): SavedMessagesState => ({ saved: [], removed: [] });

export const savedMessageKey = (roomId: string, eventId: string): string =>
  `${roomId}\u0000${eventId}`;

const isId = (value: unknown, sigil: string): value is string =>
  typeof value === 'string' && value.length > 1 && value.length <= 255 && value.startsWith(sigil);

const isTs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

type Entry = { roomId: string; eventId: string; savedTs?: number; removedTs?: number };

const collect = (into: Map<string, Entry>, raw: unknown): void => {
  if (!raw || typeof raw !== 'object') return;
  const { saved, removed } = raw as { saved?: unknown; removed?: unknown };
  const add = (item: unknown, field: 'saved_ts' | 'removed_ts') => {
    if (!item || typeof item !== 'object') return;
    const { room_id: roomId, event_id: eventId } = item as Record<string, unknown>;
    const ts = (item as Record<string, unknown>)[field];
    if (!isId(roomId, '!') || !isId(eventId, '$') || !isTs(ts)) return;
    const key = savedMessageKey(roomId, eventId);
    const entry = into.get(key) ?? { roomId, eventId };
    if (field === 'saved_ts') entry.savedTs = Math.max(entry.savedTs ?? -1, ts);
    else entry.removedTs = Math.max(entry.removedTs ?? -1, ts);
    into.set(key, entry);
  };
  if (Array.isArray(saved)) saved.forEach((item) => add(item, 'saved_ts'));
  if (Array.isArray(removed)) removed.forEach((item) => add(item, 'removed_ts'));
};

const byNewest =
  <T>(ts: (item: T) => number, tie: (item: T) => string) =>
  (a: T, b: T) => {
    const difference = ts(b) - ts(a);
    if (difference !== 0) return difference;
    if (tie(a) < tie(b)) return -1;
    if (tie(a) > tie(b)) return 1;
    return 0;
  };

const build = (entries: Map<string, Entry>, now: number): SavedMessagesState => {
  const saved: SavedMessage[] = [];
  const removed: RemovedMessage[] = [];
  entries.forEach((entry) => {
    const savedTs = entry.savedTs ?? -1;
    const removedTs = entry.removedTs ?? -1;
    if (savedTs > removedTs) {
      saved.push({ room_id: entry.roomId, event_id: entry.eventId, saved_ts: savedTs });
    } else if (removedTs >= 0 && now - removedTs <= SAVED_REMOVED_KEEP_MS) {
      removed.push({ room_id: entry.roomId, event_id: entry.eventId, removed_ts: removedTs });
    }
  });
  saved.sort(
    byNewest<SavedMessage>(
      (item) => item.saved_ts,
      (item) => savedMessageKey(item.room_id, item.event_id)
    )
  );
  removed.sort(
    byNewest<RemovedMessage>(
      (item) => item.removed_ts,
      (item) => savedMessageKey(item.room_id, item.event_id)
    )
  );
  return {
    // Only when two devices together went over the limit: the oldest ones fall off.
    saved: saved.slice(0, SAVED_MESSAGES_LIMIT),
    removed: removed.slice(0, SAVED_REMOVED_LIMIT),
  };
};

/** Reads stored content; anything malformed is skipped, duplicates keep their newest time. */
export const parseSavedMessages = (raw: unknown, now: number): SavedMessagesState => {
  const entries = new Map<string, Entry>();
  collect(entries, raw);
  return build(entries, now);
};

/** Both lists together: per message the newer of saved and removed wins. */
export const mergeSavedMessages = (
  a: SavedMessagesState | unknown,
  b: SavedMessagesState | unknown,
  now: number
): SavedMessagesState => {
  const entries = new Map<string, Entry>();
  collect(entries, a);
  collect(entries, b);
  return build(entries, now);
};

export const toSavedMessagesContent = (state: SavedMessagesState): SavedMessagesContent => ({
  version: 1,
  saved: state.saved,
  removed: state.removed,
});

export const isMessageSaved = (
  state: SavedMessagesState,
  roomId: string,
  eventId: string
): boolean => state.saved.some((item) => item.room_id === roomId && item.event_id === eventId);

export type SaveResult = 'saved' | 'already' | 'full';

/** Adds a message at the top. A full list stays as it is (`full`). */
export const saveMessage = (
  state: SavedMessagesState,
  roomId: string,
  eventId: string,
  now: number
): { state: SavedMessagesState; result: SaveResult } => {
  if (isMessageSaved(state, roomId, eventId)) return { state, result: 'already' };
  if (state.saved.length >= SAVED_MESSAGES_LIMIT) return { state, result: 'full' };
  const marker = state.removed.find((item) => item.room_id === roomId && item.event_id === eventId);
  // Newer than its removal marker even when this device's clock is behind the other one's.
  const savedTs = Math.max(now, (marker?.removed_ts ?? -1) + 1);
  const next = mergeSavedMessages(
    state,
    { saved: [{ room_id: roomId, event_id: eventId, saved_ts: savedTs }] },
    now
  );
  return { state: next, result: 'saved' };
};

/** Removes messages and leaves a marker for each, so merges keep them removed. */
export const removeSavedMessages = (
  state: SavedMessagesState,
  items: { room_id: string; event_id: string }[],
  now: number
): SavedMessagesState => {
  const removed: RemovedMessage[] = [];
  items.forEach(({ room_id: roomId, event_id: eventId }) => {
    const current = state.saved.find(
      (item) => item.room_id === roomId && item.event_id === eventId
    );
    if (!current) return;
    removed.push({
      room_id: roomId,
      event_id: eventId,
      removed_ts: Math.max(now, current.saved_ts + 1),
    });
  });
  if (removed.length === 0) return state;
  return mergeSavedMessages(state, { removed }, now);
};

const sameItems = <T extends object>(a: T[], b: T[]): boolean =>
  a.length === b.length && a.every((item, i) => JSON.stringify(item) === JSON.stringify(b[i]));

export const sameSavedMessages = (a: SavedMessagesState, b: SavedMessagesState): boolean =>
  sameItems(a.saved, b.saved) && sameItems(a.removed, b.removed);

/**
 * Whether the server's list misses something of ours (a write of another device crossed ours),
 * so the merge has to be written again.
 */
export const savedNeedsRewrite = (
  remote: unknown,
  ours: SavedMessagesState,
  now: number
): boolean =>
  !sameSavedMessages(parseSavedMessages(remote, now), mergeSavedMessages(remote, ours, now));

/** A short plain-text line for a saved message, by event type and content. */
export const savedMessagePreview = (
  type: string,
  content: Record<string, unknown> | undefined
): string => {
  if (type === 'm.room.encrypted') return 'Encrypted message';
  if (type === 'm.sticker') return 'Sticker';
  if (type !== 'm.room.message' || !content) return 'Message';
  const body = typeof content.body === 'string' ? content.body : '';
  const filename = typeof content.filename === 'string' ? content.filename : '';
  switch (content.msgtype) {
    case 'm.image':
      return filename || body ? `Photo: ${filename || body}` : 'Photo';
    case 'm.video':
      return 'Video';
    case 'm.audio':
      return content['org.matrix.msc3245.voice'] !== undefined ? 'Voice message' : 'Audio';
    case 'm.file':
      return filename || body ? `File: ${filename || body}` : 'File';
    case 'm.location':
      return 'Location';
    default: {
      const text = replyPreviewText(body).trim();
      return text || 'Message';
    }
  }
};
