// Logic behind the thread view (#188), kept free of React and the SDK so tests can run it.
//
// The Matrix client runs without thread support, so replies to a thread also stay in the room
// timeline. The thread view collects them from two places: the events already in the timeline and
// the server's list of `m.thread` relations (older replies). Both are merged here.

export type ThreadEventLike = {
  id?: string;
  ts: number;
  /** event ID of the thread root, if the event has an `m.thread` relation */
  threadRootId?: string;
};

/** Thread replies of `rootId`, merged from several lists, without duplicates, oldest first. */
export const mergeThreadReplies = <T extends ThreadEventLike>(
  rootId: string,
  ...lists: T[][]
): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  lists.forEach((list) => {
    list.forEach((evt) => {
      if (!evt.id || evt.id === rootId || evt.threadRootId !== rootId || seen.has(evt.id)) return;
      seen.add(evt.id);
      out.push(evt);
    });
  });
  return out.sort((a, b) => a.ts - b.ts);
};

export type ThreadReplyContent = {
  msgtype: 'm.text';
  body: string;
  'm.relates_to': {
    rel_type: 'm.thread';
    event_id: string;
    is_falling_back: true;
    'm.in_reply_to': { event_id: string };
  };
};

/**
 * Content of a message sent from the thread view. `lastEventId` is the newest message of the thread
 * (the root while it has no replies): clients without thread support show it as a normal reply.
 */
export const buildThreadReply = (
  rootId: string,
  lastEventId: string | undefined,
  text: string
): ThreadReplyContent | undefined => {
  const body = text.trim();
  if (!body) return undefined;
  return {
    msgtype: 'm.text',
    body,
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: rootId,
      is_falling_back: true,
      'm.in_reply_to': { event_id: lastEventId ?? rootId },
    },
  };
};
