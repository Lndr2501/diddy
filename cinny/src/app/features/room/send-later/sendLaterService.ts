import { IContent, MatrixClient, MatrixError, MatrixEvent, Room } from 'matrix-js-sdk';
import {
  DELAYED_EVENTS_FEATURE,
  ServerDelayedMessage,
  maxDelayExceeded,
  parseDelayedEvents,
} from './sendLaterLogic';
import { getKnownMaxDelay, setKnownMaxDelay } from '../../../state/scheduledMessages';

/**
 * Matrix side of "Send later": MSC4140 delayed events on the homeserver.
 *
 * matrix-js-sdk 41 sends delayed events without encrypting them (its `encryptAndSendEvent`
 * skips encryption for delayed events, "TODO: Allow encrypted delayed events"). In an encrypted
 * room that would put the text on the server in plain, so Diddy encrypts the event itself first,
 * with the room's current Megolm session (the same Rust crypto call a normal send makes), and
 * schedules the encrypted event. Who joins before it goes out did not get that session key.
 */

type CryptoBackendLike = {
  encryptEvent: (event: MatrixEvent, room: Room) => Promise<void>;
};

/** The client's crypto backend; not public API, so it is checked before use. */
const cryptoBackendOf = (mx: MatrixClient): CryptoBackendLike | undefined => {
  const backend = (mx as unknown as { cryptoBackend?: Partial<CryptoBackendLike> }).cryptoBackend;
  return backend && typeof backend.encryptEvent === 'function'
    ? (backend as CryptoBackendLike)
    : undefined;
};

export const isRoomEncrypted = (room: Room): boolean => room.hasEncryptionStateEvent();

/** Whether this client can encrypt an event without sending it right away. */
export const canEncryptAhead = (mx: MatrixClient): boolean => !!cryptoBackendOf(mx);

export const serverSupportsDelayedEvents = async (mx: MatrixClient): Promise<boolean> => {
  try {
    return await mx.doesServerSupportUnstableFeature(DELAYED_EVENTS_FEATURE);
  } catch {
    return false;
  }
};

export const knownMaxDelay = (mx: MatrixClient): number | undefined =>
  getKnownMaxDelay(mx.getHomeserverUrl());

/** The server refused the delay as too long; `maxDelayMs` is its limit when it said so. */
export class DelayTooLongError extends Error {
  constructor(public readonly maxDelayMs: number | undefined) {
    super('The server does not accept such a long delay.');
  }
}

/**
 * Schedules `content` as an `m.room.message` on the server and returns the delay id. Encrypted
 * rooms get the event encrypted now. Throws DelayTooLongError when the server's limit is hit
 * (the limit is remembered for the next choice).
 */
export const scheduleOnServer = async (
  mx: MatrixClient,
  room: Room,
  content: IContent,
  delayMs: number
): Promise<string> => {
  const txnId = mx.makeTxnId();
  let type = 'm.room.message';
  let wireContent: IContent = content;
  if (isRoomEncrypted(room)) {
    const backend = cryptoBackendOf(mx);
    if (!backend) throw new Error('This app cannot encrypt a message ahead of time.');
    const event = new MatrixEvent({
      type,
      content: JSON.parse(JSON.stringify(content)),
      room_id: room.roomId,
      sender: mx.getUserId() ?? undefined,
      event_id: `~${room.roomId}:${txnId}`,
      origin_server_ts: Date.now(),
    });
    event.setTxnId(txnId);
    await backend.encryptEvent(event, room);
    if (!event.isEncrypted()) throw new Error('The message could not be encrypted.');
    type = event.getWireType();
    wireContent = event.getWireContent();
  }
  try {
    const res = await mx._unstable_sendDelayedEvent(
      room.roomId,
      { delay: delayMs },
      null,
      type as never,
      wireContent as never,
      txnId
    );
    return res.delay_id;
  } catch (err) {
    const matrixErr = err instanceof MatrixError ? err : undefined;
    const exceeded = maxDelayExceeded(
      matrixErr ? { errcode: matrixErr.errcode, data: matrixErr.data } : undefined
    );
    if (exceeded) {
      // Without a stated limit: at least this delay is too long.
      const limit = exceeded.maxDelayMs ?? delayMs - 1;
      setKnownMaxDelay(mx.getHomeserverUrl(), limit);
      throw new DelayTooLongError(exceeded.maxDelayMs);
    }
    throw err;
  }
};

/** M_NOT_FOUND: the server no longer has it (already sent or cancelled). */
export const isNotFound = (err: unknown): boolean =>
  err instanceof MatrixError && err.errcode === 'M_NOT_FOUND';

export const cancelOnServer = (mx: MatrixClient, delayId: string) =>
  mx._unstable_cancelScheduledDelayedEvent(delayId);

export const sendNowOnServer = (mx: MatrixClient, delayId: string) =>
  mx._unstable_sendScheduledDelayedEvent(delayId);

/**
 * The scheduled messages on the server. Encrypted ones are decrypted (our own devices have
 * the session), and only real messages stay: Element Call keeps encrypted delayed events too.
 * Throws when the list could not be read, so callers never drop records on an error.
 */
export const listServerMessages = async (
  mx: MatrixClient,
  known: ReadonlySet<string> = new Set()
): Promise<ServerDelayedMessage[]> => {
  const res = await mx._unstable_getDelayedEvents();
  const list = parseDelayedEvents(res);
  const userId = mx.getUserId() ?? undefined;
  const out = await Promise.all(
    list.map(async (item): Promise<ServerDelayedMessage | undefined> => {
      // ours: the plain content is kept locally, no need to decrypt
      if (item.type === 'm.room.message' || known.has(item.delayId)) return item;
      try {
        const event = new MatrixEvent({
          type: item.type,
          content: item.content,
          room_id: item.roomId,
          sender: userId,
          event_id: `$diddy-delayed-${item.delayId}`,
          origin_server_ts: item.sendAt,
        });
        await mx.decryptEventIfNeeded(event);
        if (event.isDecryptionFailure() || event.getType() !== 'm.room.message') return undefined;
        return { ...item, content: event.getContent() };
      } catch {
        return undefined;
      }
    })
  );
  return out.filter((m): m is ServerDelayedMessage => !!m);
};
