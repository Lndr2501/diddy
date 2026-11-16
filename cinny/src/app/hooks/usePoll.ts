import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Direction, MatrixEvent, MatrixEventEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import {
  pollTypesFor,
  PollEnd,
  PollResponse,
  PollStart,
  PollTally,
  buildPollEnd,
  buildPollResponse,
  isPollEndType,
  isPollResponseType,
  parsePollStart,
  pollEndText,
  tallyPoll,
} from '../plugins/polls';

type LocalVote = { eventId?: string; ts: number; response?: PollResponse; end?: PollEnd };

export type PollState = {
  poll?: PollStart;
  tally?: PollTally;
  /** you may end it: you started it, or you may redact other people's messages */
  canEnd: boolean;
  vote: (answerIds: string[]) => Promise<void>;
  end: () => Promise<void>;
};

/**
 * One poll as the room sees it: the start event, the responses and end events known so far
 * (room timeline plus a one-time fetch of the relations, which also finds votes beyond the loaded
 * part of the timeline), counted per MSC3381 in plugins/polls.ts. Your own vote shows at once.
 */
export const usePollState = (room: Room, pollEvent: MatrixEvent): PollState => {
  const mx = useMatrixClient();
  const pollId = pollEvent.getId() ?? '';
  const me = mx.getUserId() ?? '';
  const types = pollTypesFor(pollEvent.getType());
  const [fetched, setFetched] = useState<MatrixEvent[]>([]);
  const [local, setLocal] = useState<LocalVote[]>([]);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const poll = useMemo(() => parsePollStart(pollEvent.getContent()), [pollEvent]);

  useEffect(() => {
    if (!pollId || pollId.startsWith('~')) return undefined;
    let cancelled = false;
    (async () => {
      const found: MatrixEvent[] = [];
      let from: string | undefined;
      const seen = new Set<string>();
      while (!cancelled) {
        // eslint-disable-next-line no-await-in-loop
        const res = await mx.relations(room.roomId, pollId, 'm.reference', null, {
          dir: Direction.Forward,
          limit: 100,
          from,
        });
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(res.events.map((e) => mx.decryptEventIfNeeded(e).catch(() => undefined)));
        found.push(...res.events);
        const next = res.nextBatch ?? undefined;
        if (!next || seen.has(next)) break;
        seen.add(next);
        from = next;
      }
      if (!cancelled) setFetched(found);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [mx, room, pollId]);

  useEffect(() => {
    const touches = (ev: MatrixEvent) => {
      const type = ev.getType();
      return (
        type === 'm.room.encrypted' ||
        ((isPollResponseType(type) || isPollEndType(type)) &&
          ev.getRelation()?.event_id === pollId)
      );
    };
    const onEvent = (ev: MatrixEvent) => {
      if (!touches(ev)) return;
      redraw();
      if (ev.getType() === 'm.room.encrypted') ev.once(MatrixEventEvent.Decrypted, redraw);
    };
    room.on(RoomEvent.Timeline, onEvent);
    room.on(RoomEvent.Redaction, redraw);
    room.on(RoomEvent.LocalEchoUpdated, onEvent);
    return () => {
      room.removeListener(RoomEvent.Timeline, onEvent);
      room.removeListener(RoomEvent.Redaction, redraw);
      room.removeListener(RoomEvent.LocalEchoUpdated, onEvent);
    };
  }, [room, pollId]);

  const creator = pollEvent.getSender() ?? '';
  const mayEnd = useCallback(
    (sender: string) =>
      room.currentState.hasSufficientPowerLevelFor('redact', room.getMember(sender)?.powerLevel ?? 0),
    [room]
  );

  const tally = poll
    ? (() => {
        const byId = new Map<string, MatrixEvent>();
        [...fetched, ...room.relations.getAllChildEventsForEvent(pollId)].forEach((ev) => {
          const id = ev.getId();
          if (id) byId.set(id, ev);
        });
        const known = Array.from(byId.values()).filter(
          (ev) => !ev.isRedacted() && Object.keys(ev.getContent()).length > 0
        );
        const responses: PollResponse[] = known
          .filter((ev) => isPollResponseType(ev.getType()))
          .map((ev) => ({ sender: ev.getSender() ?? '', ts: ev.getTs(), content: ev.getContent() }));
        const ends: PollEnd[] = known
          .filter((ev) => isPollEndType(ev.getType()))
          .map((ev) => ({ sender: ev.getSender() ?? '', ts: ev.getTs() }));
        local.forEach((l) => {
          if (l.eventId && byId.has(l.eventId)) return;
          if (l.response) responses.push(l.response);
          if (l.end) ends.push(l.end);
        });
        return tallyPoll(poll, { creator, me, responses, ends, mayEnd });
      })()
    : undefined;

  const vote = useCallback(
    async (answerIds: string[]) => {
      if (!pollId) return;
      const ts = Date.now();
      const entry: LocalVote = {
        ts,
        response: {
          sender: me,
          ts,
          content: buildPollResponse(pollId, answerIds, pollEvent.getType()),
        },
      };
      setLocal((l) => [...l, entry]);
      try {
        const res = await mx.sendEvent(
          room.roomId,
          types.response as never,
          buildPollResponse(pollId, answerIds, pollEvent.getType()) as never
        );
        entry.eventId = res.event_id;
      } catch (e) {
        setLocal((l) => l.filter((x) => x !== entry));
        throw e;
      }
    },
    [mx, room, pollId, me, pollEvent, types.response]
  );

  const end = useCallback(async () => {
    if (!pollId || !poll || !tally) return;
    const ts = Date.now();
    const entry: LocalVote = { ts, end: { sender: me, ts } };
    setLocal((l) => [...l, entry]);
    try {
      const res = await mx.sendEvent(
        room.roomId,
        types.end as never,
        buildPollEnd(pollId, pollEndText(poll, tally), pollEvent.getType()) as never
      );
      entry.eventId = res.event_id;
    } catch (e) {
      setLocal((l) => l.filter((x) => x !== entry));
      throw e;
    }
  }, [mx, room, pollId, poll, tally, me, pollEvent, types.end]);

  return {
    poll,
    tally,
    canEnd: !!poll && !tally?.ended && (creator === me || mayEnd(me)),
    vote,
    end,
  };
};
