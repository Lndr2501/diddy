import type { MatrixClient } from 'matrix-js-sdk';

/**
 * Call alerts for people whose Diddy is closed (the iOS app cannot get Apple push).
 *
 * Their phone leaves an ntfy topic in each direct message as an `app.diddy.call_push` state event
 * keyed by their user ID. When this client rings them, it posts "<name> is calling you" to it.
 */
export const CALL_PUSH_EVENT_TYPE = 'app.diddy.call_push';

export type CallPushTarget = {
  server: string;
  topic: string;
};

const TOPIC_PATTERN = /^[-_A-Za-z0-9]{1,64}$/;

/** The content comes from the other side of the room, so only a well-formed HTTPS target passes. */
export const parseCallPushTarget = (content: unknown): CallPushTarget | undefined => {
  if (!content || typeof content !== 'object') return undefined;
  const { server, topic } = content as Record<string, unknown>;
  if (typeof server !== 'string' || typeof topic !== 'string' || !TOPIC_PATTERN.test(topic)) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(server);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || !url.hostname || url.search || url.username || url.password) {
    return undefined;
  }
  return { server, topic };
};

/** JSON to the server root, so names outside ASCII survive (ntfy's title header would not). */
export const callPushRequest = (
  target: CallPushTarget,
  callerName: string
): { url: string; init: RequestInit } => ({
  url: target.server.endsWith('/') ? target.server : `${target.server}/`,
  init: {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: target.topic,
      title: `${callerName} is calling you`,
      message: 'Open Diddy to answer.',
      priority: 5,
      tags: ['telephone_receiver'],
    }),
  },
});

/** Called right after this client sent a ring. Failures only mean no alert. */
export const sendCallPush = async (mx: MatrixClient, roomId: string): Promise<void> => {
  const room = mx.getRoom(roomId);
  const ownId = mx.getSafeUserId();
  if (!room) return;
  const others = room.getJoinedMembers().filter((member) => member.userId !== ownId);
  // "is calling you" only fits a one-to-one room.
  if (others.length !== 1) return;
  const callerName = room.getMember(ownId)?.name || mx.getUser(ownId)?.displayName || ownId;

  await Promise.all(
    others.map(async (member) => {
      const event = room.currentState.getStateEvents(CALL_PUSH_EVENT_TYPE, member.userId);
      const target = parseCallPushTarget(event?.getContent());
      if (!target) return;
      const { url, init } = callPushRequest(target, callerName);
      try {
        await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
      } catch {
        // ignore, the call itself goes on
      }
    })
  );
};
