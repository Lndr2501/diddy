import { isVideoId, MAX_START } from './youtube';

// Watch together (#83): the small message the call members send each other. It travels as a
// short-lived to-device message to the devices in the call (like #57), never as a room event.

export const WATCH_EVENT = 'app.diddy.watch_together';
export const WATCH_VERSION = 1;

export type WatchPlayback = 'playing' | 'paused' | 'stopped';

/** The shared state of the video in one call. */
export type SharedWatch = {
  /** random id of one "watch together" run (a new video starts a new session) */
  session: string;
  videoId: string;
  state: WatchPlayback;
  /** position in seconds at `ts` */
  position: number;
  rate: number;
  /** sender's wall clock (ms) at which `position` was right */
  ts: number;
  /** grows with every change; the highest wins (ties: the larger sender id) */
  seq: number;
  /** who made this change */
  sender: string;
};

export type WatchMessage =
  | {
      kind: 'state';
      room: string;
      session: string;
      videoId: string;
      state: WatchPlayback;
      position: number;
      rate: number;
      ts: number;
      seq: number;
    }
  | { kind: 'request'; room: string };

export const MIN_RATE = 0.25;
export const MAX_RATE = 2;
const MAX_SEQ = 1e12;
/** Messages whose clock is further off than this get the receive time instead. */
export const MAX_CLOCK_SKEW_MS = 60_000;

const SESSION_RE = /^[A-Za-z0-9]{8,32}$/;
const ROOM_RE = /^![^\s]{1,254}$/;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Validates an incoming message; anything malformed gives undefined. */
export const parseWatchMessage = (content: unknown): WatchMessage | undefined => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const c = content as Record<string, unknown>;
  if (c.v !== WATCH_VERSION) return undefined;
  if (typeof c.room_id !== 'string' || !ROOM_RE.test(c.room_id)) return undefined;
  if (c.kind === 'request') return { kind: 'request', room: c.room_id };
  if (c.kind !== 'state') return undefined;
  if (typeof c.session !== 'string' || !SESSION_RE.test(c.session)) return undefined;
  if (!isVideoId(c.video_id)) return undefined;
  if (c.state !== 'playing' && c.state !== 'paused' && c.state !== 'stopped') return undefined;
  if (!finite(c.position) || c.position < 0 || c.position > MAX_START) return undefined;
  if (!finite(c.rate) || c.rate < MIN_RATE || c.rate > MAX_RATE) return undefined;
  if (!finite(c.ts) || c.ts <= 0 || c.ts > 1e14) return undefined;
  if (!Number.isSafeInteger(c.seq) || (c.seq as number) < 0 || (c.seq as number) > MAX_SEQ) {
    return undefined;
  }
  return {
    kind: 'state',
    room: c.room_id,
    session: c.session,
    videoId: c.video_id,
    state: c.state,
    position: c.position,
    rate: c.rate,
    ts: c.ts,
    seq: c.seq as number,
  };
};

/** The wire format of a shared state (sent as to-device content). */
export const stateContent = (room: string, s: SharedWatch): Record<string, unknown> => ({
  v: WATCH_VERSION,
  kind: 'state',
  room_id: room,
  session: s.session,
  video_id: s.videoId,
  state: s.state,
  position: Math.round(s.position * 1000) / 1000,
  rate: s.rate,
  ts: s.ts,
  seq: s.seq,
});

export const requestContent = (room: string): Record<string, unknown> => ({
  v: WATCH_VERSION,
  kind: 'request',
  room_id: room,
});

/** Turns a received state message into the shared state; a clock far off is replaced by `now`. */
export const fromMessage = (
  msg: Extract<WatchMessage, { kind: 'state' }>,
  sender: string,
  now: number
): SharedWatch => ({
  session: msg.session,
  videoId: msg.videoId,
  state: msg.state,
  position: msg.position,
  rate: msg.rate,
  ts: msg.ts > now || now - msg.ts > MAX_CLOCK_SKEW_MS ? now : msg.ts,
  seq: msg.seq,
  sender,
});

/** Last writer wins: a higher seq, or the same seq from the larger sender id. */
export const isNewer = (next: SharedWatch, current: SharedWatch | undefined): boolean => {
  if (!current) return true;
  if (next.seq !== current.seq) return next.seq > current.seq;
  if (next.sender !== current.sender) return next.sender > current.sender;
  // same writer, same seq: only a different content counts (a repeated message is no change)
  return false;
};

/** Where the video should be now (seconds). */
export const expectedPosition = (s: SharedWatch, now: number): number => {
  if (s.state !== 'playing') return s.position;
  const elapsed = Math.max(0, now - s.ts) / 1000;
  return Math.min(MAX_START, s.position + elapsed * s.rate);
};

/** The same state, restated at `now` (for answers to late joiners). */
export const rebase = (s: SharedWatch, now: number): SharedWatch => ({
  ...s,
  position: expectedPosition(s, now),
  ts: now,
});

/** A local change: one higher than everything seen so far. */
export const nextChange = (
  current: SharedWatch,
  patch: Partial<Pick<SharedWatch, 'state' | 'position' | 'rate'>>,
  sender: string,
  now: number
): SharedWatch => ({
  ...rebase(current, now),
  ...patch,
  rate: Math.min(MAX_RATE, Math.max(MIN_RATE, patch.rate ?? current.rate)),
  ts: now,
  seq: current.seq + 1,
  sender,
});

/** A random session id (letters and digits). */
export const newSessionId = (random: () => number = Math.random): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 16 }, () => chars[Math.floor(random() * chars.length)]).join('');
};

export const startWatch = (
  videoId: string,
  start: number,
  previous: SharedWatch | undefined,
  sender: string,
  now: number,
  random?: () => number
): SharedWatch => ({
  session: newSessionId(random),
  videoId,
  state: 'playing',
  position: Math.min(MAX_START, Math.max(0, start)),
  rate: 1,
  ts: now,
  seq: (previous?.seq ?? 0) + 1,
  sender,
});
