// Issue #109: message search shows only the current version of an edited message.
//
// The homeserver searches event bodies, so an edited message can come back twice: once as the
// original event (old text) and once as its m.replace edit (new text). This module folds those
// hits into one result per original event that shows the latest trusted edit, hides hits that
// only matched text which is no longer current, and dedupes across result pages.
//
// Pure logic without imports so it can be unit tested (tests/searchEdits.test.cjs).

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SearchEvent = {
  event_id: string;
  room_id: string;
  sender: string;
  type: string;
  origin_server_ts: number;
  content: Record<string, any>;
  unsigned?: Record<string, any>;
};

export type SearchHit<E extends SearchEvent = SearchEvent, C = unknown> = {
  rank: number;
  event: E;
  context: C;
};

export type ResolvedHit<E extends SearchEvent = SearchEvent, C = unknown> = {
  rank: number;
  /** The original event, with its content replaced by the latest edit's m.new_content. */
  event: E;
  context: C;
  /** Event id of the original message (what the timeline shows and "Open" jumps to). */
  originalEventId: string;
  edited: boolean;
};

export type EventRef = { roomId: string; eventId: string };

const REPLACE = 'm.replace';

/** Event id an m.replace edit points to, or undefined if the event is not an edit. */
export const getReplaceTarget = (event: SearchEvent): string | undefined => {
  const relation = event.content?.['m.relates_to'];
  if (relation?.rel_type !== REPLACE) return undefined;
  return typeof relation.event_id === 'string' ? relation.event_id : undefined;
};

export const isReplaceEvent = (event: SearchEvent): boolean => !!getReplaceTarget(event);

const isRedacted = (event: SearchEvent): boolean => !!event.unsigned?.redacted_because;

type BundledEdit = {
  event_id?: string;
  sender?: string;
  origin_server_ts?: number;
  room_id?: string;
  content?: Record<string, any>;
};

/** The server-chosen latest edit bundled in unsigned["m.relations"]["m.replace"], if any. */
const getBundledEdit = (event: SearchEvent): BundledEdit | undefined => {
  const bundled = event.unsigned?.['m.relations']?.[REPLACE];
  if (!bundled || typeof bundled !== 'object' || typeof bundled.event_id !== 'string') {
    return undefined;
  }
  return bundled;
};

/**
 * Whether `edit` is a trustworthy replacement of `original`: same room, same sender, same event
 * type, pointing at the original, carrying m.new_content. Edits of redacted messages and edits of
 * edits are ignored (Matrix spec, "Validity of replacement events").
 */
export const isValidEdit = (original: SearchEvent, edit: SearchEvent): boolean =>
  !isReplaceEvent(original) &&
  !isRedacted(original) &&
  !isRedacted(edit) &&
  getReplaceTarget(edit) === original.event_id &&
  edit.room_id === original.room_id &&
  edit.sender === original.sender &&
  edit.type === original.type &&
  !!edit.content['m.new_content'] &&
  typeof edit.content['m.new_content'] === 'object';

const isLater = (a: SearchEvent, b: SearchEvent): boolean =>
  a.origin_server_ts !== b.origin_server_ts
    ? a.origin_server_ts > b.origin_server_ts
    : a.event_id > b.event_id;

/** Latest valid edit of `original` among `candidates` (timestamp, then event id breaks ties). */
export const pickLatestEdit = <E extends SearchEvent>(
  original: SearchEvent,
  candidates: E[]
): E | undefined =>
  candidates
    .filter((edit) => isValidEdit(original, edit))
    .reduce<E | undefined>((latest, edit) => (!latest || isLater(edit, latest) ? edit : latest), undefined);

const normalize = (text: string): string =>
  text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const words = (text: string): string[] => normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Approximates the server's full-text match of `term` against `text`: every word of the term must
 * be the prefix of a word in the text ("or" switches to any-word, a leading "-" excludes a word).
 * The server additionally stems words, so this can miss a few stemmed matches; it is only used to
 * decide whether an edited message still contains a term that matched its old text.
 */
export const textMatchesTerm = (text: string, term: string): boolean => {
  const textWords = words(text);
  const hasWord = (w: string) => textWords.some((tw) => tw.startsWith(w));
  const positive: string[] = [];
  const negative: string[] = [];
  let anyMode = false;
  term
    .replace(/"/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .forEach((raw) => {
      if (raw.toLowerCase() === 'or') {
        anyMode = true;
        return;
      }
      if (raw.toLowerCase() === 'and') return;
      const target = raw.startsWith('-') && raw.length > 1 ? negative : positive;
      target.push(...words(raw));
    });
  if (negative.some(hasWord)) return false;
  if (positive.length === 0) return false;
  return anyMode ? positive.some(hasWord) : positive.every(hasWord);
};

const contentBody = (content: Record<string, any> | undefined): string =>
  typeof content?.body === 'string' ? content.body : '';

/**
 * Events the client still has to fetch before it can resolve these hits:
 * - `originals`: originals of edit hits that are not hits themselves.
 */
export const missingOriginals = (hits: SearchHit[], known: SearchEvent[] = []): EventRef[] => {
  const have = new Set([...hits.map((h) => h.event.event_id), ...known.map((e) => e.event_id)]);
  const refs = new Map<string, EventRef>();
  hits.forEach(({ event }) => {
    const target = getReplaceTarget(event);
    if (target && !have.has(target)) refs.set(target, { roomId: event.room_id, eventId: target });
  });
  return [...refs.values()];
};

/**
 * Latest edits the server bundled (by reference only) on the given originals that are not
 * already known with their content.
 */
export const missingBundledEdits = (originals: SearchEvent[], known: SearchEvent[]): EventRef[] => {
  const have = new Set(known.map((e) => e.event_id));
  const refs = new Map<string, EventRef>();
  originals.forEach((original) => {
    if (isReplaceEvent(original) || isRedacted(original)) return;
    const bundled = getBundledEdit(original);
    if (!bundled?.event_id || have.has(bundled.event_id) || bundled.content) return;
    if (bundled.sender && bundled.sender !== original.sender) return;
    refs.set(bundled.event_id, { roomId: original.room_id, eventId: bundled.event_id });
  });
  return [...refs.values()];
};

const bundledAsEvent = (original: SearchEvent): SearchEvent | undefined => {
  const bundled = getBundledEdit(original);
  if (!bundled?.content || !bundled.event_id) return undefined;
  return {
    event_id: bundled.event_id,
    room_id: bundled.room_id ?? original.room_id,
    sender: bundled.sender ?? '',
    type: (bundled as any).type ?? original.type,
    origin_server_ts: bundled.origin_server_ts ?? 0,
    content: bundled.content,
    unsigned: (bundled as any).unsigned,
  };
};

/** The original event shown with the content of `edit` (keeping the original's relations). */
const displayEvent = <E extends SearchEvent>(original: E, edit: SearchEvent): E => {
  const content: Record<string, any> = { ...edit.content['m.new_content'] };
  delete content['m.relates_to'];
  const relation = original.content['m.relates_to'];
  if (relation) content['m.relates_to'] = relation;
  return { ...original, content };
};

/**
 * Folds one page of search hits into one result per original message.
 *
 * @param hits search results in server order
 * @param extraEvents originals and edits fetched separately (see missingOriginals /
 *   missingBundledEdits); they never become results on their own
 * @param term the search term (used to hide hits whose current text no longer matches)
 */
export const resolveSearchHits = <E extends SearchEvent, C>(
  hits: SearchHit<E, C>[],
  extraEvents: E[],
  term: string
): ResolvedHit<E, C>[] => {
  const hitIds = new Set(hits.map((h) => h.event.event_id));
  const originals = new Map<string, E>();
  const editsByTarget = new Map<string, E[]>();
  const knownIds = new Set<string>();
  [...hits.map((h) => h.event), ...extraEvents].forEach((event) => {
    if (knownIds.has(event.event_id)) return;
    knownIds.add(event.event_id);
    const target = getReplaceTarget(event);
    if (target) {
      editsByTarget.set(target, [...(editsByTarget.get(target) ?? []), event]);
    } else {
      originals.set(event.event_id, event);
    }
  });

  const seen = new Set<string>();
  const resolved: ResolvedHit<E, C>[] = [];

  hits.forEach((hit) => {
    const target = getReplaceTarget(hit.event);
    const originalId = target ?? hit.event.event_id;
    if (seen.has(originalId)) return;

    const original = originals.get(originalId);
    // An edit whose original we cannot see cannot be verified (sender, room): drop it.
    if (!original) return;

    const candidates: E[] = [...(editsByTarget.get(originalId) ?? [])];
    const bundled = bundledAsEvent(original);
    if (bundled && !knownIds.has(bundled.event_id)) candidates.push(bundled as E);
    const latest = pickLatestEdit(original, candidates);

    // The server knows of a newer edit than any we could load: current text unknown, do not
    // show possibly stale text.
    const bundledRef = getBundledEdit(original);
    if (
      bundledRef?.event_id &&
      !isRedacted(original) &&
      (!bundledRef.sender || bundledRef.sender === original.sender) &&
      !candidates.some((c) => c.event_id === bundledRef.event_id && isValidEdit(original, c)) &&
      (!latest || (bundledRef.origin_server_ts ?? Infinity) > latest.origin_server_ts)
    ) {
      return;
    }

    if (target) {
      // Hit is an edit. Untrusted edits (other sender/room/type) are ignored entirely.
      if (!latest) return;
      if (latest.event_id !== hit.event.event_id) {
        // An older edit matched; show the message only if its current text still matches,
        // unless the latest edit is a hit itself (then it is handled when we get to it).
        if (hitIds.has(latest.event_id)) return;
        if (!textMatchesTerm(contentBody(latest.content['m.new_content']), term)) return;
      }
    } else if (latest && !hitIds.has(latest.event_id)) {
      // Hit is the original but it has been edited: it only matched the old text unless the
      // current text still contains the term.
      if (!textMatchesTerm(contentBody(latest.content['m.new_content']), term)) return;
    }

    seen.add(originalId);
    resolved.push({
      rank: hit.rank,
      event: latest ? displayEvent(original, latest) : original,
      context: hit.context,
      originalEventId: originalId,
      edited: !!latest,
    });
  });

  return resolved;
};

/**
 * Concatenates resolved pages, keeping the first occurrence of each original message, and
 * groups consecutive results of the same room.
 */
export const mergeSearchPages = <T extends { originalEventId: string; event: SearchEvent }>(
  pages: T[][]
): { roomId: string; items: T[] }[] => {
  const seen = new Set<string>();
  const groups: { roomId: string; items: T[] }[] = [];
  pages.forEach((page) =>
    page.forEach((item) => {
      if (seen.has(item.originalEventId)) return;
      seen.add(item.originalEventId);
      const roomId = item.event.room_id;
      const last = groups[groups.length - 1];
      if (last && last.roomId === roomId) last.items.push(item);
      else groups.push({ roomId, items: [item] });
    })
  );
  return groups;
};
