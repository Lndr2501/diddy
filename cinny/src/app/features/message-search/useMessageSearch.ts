import {
  IEventWithRoomId,
  IResultContext,
  ISearchRequestBody,
  SearchOrderBy,
} from 'matrix-js-sdk';
import { useCallback } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  EventRef,
  mergeSearchPages,
  missingBundledEdits,
  missingOriginals,
  resolveSearchHits,
} from './searchEdits';

export type ResultItem = {
  rank: number;
  /** Original event; for edited messages its content is the latest edit's m.new_content. */
  event: IEventWithRoomId;
  context: IResultContext;
  /** Id of the original event (what the timeline shows and "Open" jumps to). */
  originalEventId: string;
  edited: boolean;
};

export type ResultGroup = {
  roomId: string;
  items: ResultItem[];
};

export type SearchResult = {
  nextToken?: string;
  highlights: string[];
  items: ResultItem[];
};

/** Groups the items of all loaded pages, showing each message once (#109). */
export const groupSearchPages = (pages: SearchResult[]): ResultGroup[] =>
  mergeSearchPages(pages.map((page) => page.items));

export type MessageSearchParams = {
  term?: string;
  order?: string;
  rooms?: string[];
  senders?: string[];
};
export const useMessageSearch = (params: MessageSearchParams) => {
  const mx = useMatrixClient();
  const { term, order, rooms, senders } = params;

  const searchMessages = useCallback(
    async (nextBatch?: string) => {
      if (!term)
        return {
          highlights: [],
          items: [],
        };
      const limit = 20;

      const requestBody: ISearchRequestBody = {
        search_categories: {
          room_events: {
            event_context: {
              before_limit: 0,
              after_limit: 0,
              include_profile: false,
            },
            filter: {
              limit,
              rooms,
              senders,
            },
            include_state: false,
            order_by: order as SearchOrderBy.Recent,
            search_term: term,
          },
        },
      };

      const r = await mx.search({
        body: requestBody,
        next_batch: nextBatch === '' ? undefined : nextBatch,
      });
      const roomEvents = r.search_categories.room_events;
      const hits = (roomEvents?.results ?? []).map((item) => ({
        rank: item.rank,
        event: item.result,
        context: item.context,
      }));

      // Edited messages: load originals of edit hits and the latest edits the server only
      // references, so each message shows once with its current text.
      const fetchEvents = async (refs: EventRef[]): Promise<IEventWithRoomId[]> => {
        const events = await Promise.all(
          refs.map(async ({ roomId, eventId }) => {
            try {
              const event = await mx.fetchRoomEvent(roomId, eventId);
              return { ...event, room_id: event.room_id ?? roomId } as IEventWithRoomId;
            } catch {
              return undefined;
            }
          })
        );
        return events.filter((e): e is IEventWithRoomId => !!e);
      };
      const originals = await fetchEvents(missingOriginals(hits));
      const known = [...hits.map((h) => h.event), ...originals];
      const edits = await fetchEvents(missingBundledEdits(known, known));

      return {
        nextToken: roomEvents?.next_batch,
        highlights: roomEvents?.highlights ?? [],
        items: resolveSearchHits(hits, [...originals, ...edits], term),
      };
    },
    [mx, term, order, rooms, senders]
  );

  return searchMessages;
};
