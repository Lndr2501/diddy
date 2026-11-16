/**
 * Send later: the rules without Matrix client or browser, so they can be tested
 * (tests/sendLater.test.cjs). iOS has the same rules in ios/Diddy/Matrix/SendLaterLogic.swift.
 *
 * Two ways to send a message later:
 * - server: MSC4140 delayed events. The homeserver keeps the event and sends it at the time,
 *   even when no Diddy is running. In encrypted rooms the event is encrypted now, with the room
 *   key of now: people or devices that join before it goes out may not be able to read it.
 * - local: the message waits on this device and goes out when Diddy runs at that time, or on the
 *   next start (then it is marked as sent late).
 */

/** Unstable feature flag of MSC4140 in `/versions`, and the prefix of its query parameters. */
export const DELAYED_EVENTS_FEATURE = 'org.matrix.msc4140';
export const DELAY_QUERY_PARAM = `${DELAYED_EVENTS_FEATURE}.delay`;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A scheduled message must be at least this far ahead, otherwise just send it. */
export const MIN_LEAD_MS = MINUTE;
/** And at most this far: a year. */
export const MAX_AHEAD_MS = 365 * DAY;
/** A local message that goes out this much after its time counts as sent late. */
export const LATE_AFTER_MS = 2 * MINUTE;
/** "Today evening" is offered only while it is at least this far away. */
export const EVENING_MIN_LEAD_MS = 30 * MINUTE;
export const EVENING_HOUR = 18;
export const MORNING_HOUR = 9;

export type SendLaterRoute = 'server' | 'local';

export type QuickPickId = 'hour' | 'evening' | 'tomorrow';
export type QuickPick = { id: QuickPickId; at: number };

const startOfMinute = (ts: number): number => Math.floor(ts / MINUTE) * MINUTE;

/** The time at `hour:00` local time, `daysAhead` days after the day of `now`. */
export const atLocalHour = (now: number, daysAhead: number, hour: number): number => {
  const d = new Date(now);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

/**
 * The quick picks of the menu: in one hour, today at 18:00 (only while that is at least half an
 * hour away) and tomorrow at 9:00. Local time, so daylight saving shifts are handled by Date.
 */
export const quickPicks = (now: number): QuickPick[] => {
  const picks: QuickPick[] = [{ id: 'hour', at: startOfMinute(now + HOUR) }];
  const evening = atLocalHour(now, 0, EVENING_HOUR);
  if (evening - now >= EVENING_MIN_LEAD_MS) picks.push({ id: 'evening', at: evening });
  picks.push({ id: 'tomorrow', at: atLocalHour(now, 1, MORNING_HOUR) });
  return picks;
};

export type SendAtCheck = 'ok' | 'past' | 'too-soon' | 'too-far';

/** Whether a picked time can be scheduled. */
export const checkSendAt = (at: number, now: number): SendAtCheck => {
  if (!Number.isFinite(at) || at <= now) return 'past';
  if (at - now < MIN_LEAD_MS) return 'too-soon';
  if (at - now > MAX_AHEAD_MS) return 'too-far';
  return 'ok';
};

/** The default of the free date/time choice: the next full hour that is at least an hour away. */
export const defaultCustomTime = (now: number): number => {
  const d = new Date(now + HOUR);
  if (d.getMinutes() !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0) {
    d.setHours(d.getHours() + 1, 0, 0, 0);
  }
  return d.getTime();
};

export type RouteInput = {
  /** The homeserver lists `org.matrix.msc4140` in `/versions`. */
  serverSupport: boolean;
  delayMs: number;
  /** The longest delay the server accepts, when known (learned from M_MAX_DELAY_EXCEEDED). */
  maxDelayMs?: number;
  encrypted: boolean;
  /** This app can encrypt an event without sending it (desktop: yes, iOS: no). */
  canEncryptAhead: boolean;
  /** The user picked "only from this device". */
  preferLocal?: boolean;
};

export type RouteReason =
  | 'server'
  | 'chosen-local'
  | 'no-server-support'
  | 'too-far-for-server'
  | 'encrypted-local'
  /** The server refused or could not be reached while scheduling. */
  | 'server-failed';

export type RouteChoice = {
  route: SendLaterRoute;
  reason: RouteReason;
  /** Server route in an encrypted room: the event is encrypted at scheduling time. */
  encryptedAhead: boolean;
};

/** Server when it can, otherwise this device; the reason is shown in the dialog. */
export const chooseRoute = (input: RouteInput): RouteChoice => {
  const local = (reason: RouteReason): RouteChoice => ({
    route: 'local',
    reason,
    encryptedAhead: false,
  });
  if (input.preferLocal) return local('chosen-local');
  if (!input.serverSupport) return local('no-server-support');
  if (input.maxDelayMs !== undefined && input.delayMs > input.maxDelayMs) {
    return local('too-far-for-server');
  }
  if (input.encrypted && !input.canEncryptAhead) return local('encrypted-local');
  return { route: 'server', reason: 'server', encryptedAhead: input.encrypted };
};

/** Whether the server route could be used at all (decides if "send from the server" is offered). */
export const serverRoutePossible = (input: RouteInput): boolean =>
  chooseRoute({ ...input, preferLocal: false }).route === 'server';

type MatrixErrorLike = {
  errcode?: string;
  data?: Record<string, unknown>;
};

/**
 * A refused delayed send because the delay is too long. Synapse answers with `M_UNKNOWN` and
 * `org.matrix.msc4140.errcode: M_MAX_DELAY_EXCEEDED` plus `org.matrix.msc4140.max_delay`; the MSC
 * itself names `M_MAX_DELAY_EXCEEDED` and `max_delay`. Returns undefined for other errors and
 * `{ maxDelayMs: undefined }` when the server did not say its limit.
 */
export const maxDelayExceeded = (
  err: MatrixErrorLike | undefined | null
): { maxDelayMs: number | undefined } | undefined => {
  if (!err) return undefined;
  const data = err.data ?? {};
  const code = err.errcode ?? data.errcode;
  const unstableCode = data[`${DELAYED_EVENTS_FEATURE}.errcode`];
  if (code !== 'M_MAX_DELAY_EXCEEDED' && unstableCode !== 'M_MAX_DELAY_EXCEEDED') return undefined;
  const raw = data[`${DELAYED_EVENTS_FEATURE}.max_delay`] ?? data.max_delay;
  const maxDelayMs = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined;
  return { maxDelayMs };
};

/** One delayed event of the user as `GET /delayed_events` lists it. */
export type ServerDelayedMessage = {
  delayId: string;
  roomId: string;
  type: string;
  content: Record<string, unknown>;
  /** When the server will send it. */
  sendAt: number;
};

const MESSAGE_TYPES = ['m.room.message', 'm.room.encrypted'];

/**
 * The scheduled timeline messages from a `GET /delayed_events` answer. Synapse answers with
 * `delayed_events`, the current MSC with `scheduled`; both are read. State events (Element Call
 * keeps its "leave the call" event there) and other types are left out.
 */
export const parseDelayedEvents = (res: unknown): ServerDelayedMessage[] => {
  if (!res || typeof res !== 'object') return [];
  const obj = res as Record<string, unknown>;
  let list: unknown[] = [];
  if (Array.isArray(obj.scheduled)) list = obj.scheduled;
  else if (Array.isArray(obj.delayed_events)) list = obj.delayed_events;
  const out: ServerDelayedMessage[] = [];
  list.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const e = item as Record<string, unknown>;
    if (typeof e.delay_id !== 'string' || typeof e.room_id !== 'string') return;
    if (typeof e.type !== 'string' || !MESSAGE_TYPES.includes(e.type)) return;
    if (e.state_key !== undefined) return;
    if (typeof e.delay !== 'number') return;
    if (!e.content || typeof e.content !== 'object') return;
    const since = typeof e.running_since === 'number' ? e.running_since : 0;
    out.push({
      delayId: e.delay_id,
      roomId: e.room_id,
      type: e.type,
      content: e.content as Record<string, unknown>,
      sendAt: since + e.delay,
    });
  });
  return out.sort((a, b) => a.sendAt - b.sendAt);
};

/** What this device keeps for every message it scheduled (both routes). */
export type ScheduledMessage = {
  id: string;
  roomId: string;
  sendAt: number;
  createdAt: number;
  route: SendLaterRoute;
  /** Server route: the delay id, to cancel or send it now. */
  delayId?: string;
  /** Server route in an encrypted room: encrypted at scheduling time. */
  encryptedAhead?: boolean;
  /** The plain event content (also for server messages: for the preview and for editing). */
  content: Record<string, unknown>;
  /** The composer content, to put it back for editing. */
  draft?: unknown;
  /** The reply it answers, to restore the reply when editing. */
  reply?: { eventId: string; userId: string; body: string; relation?: unknown };
  /** Why the server route was not used (shown in the overview). */
  reason?: RouteReason;
};

/** Local messages whose time has come, oldest first. */
export const dueMessages = <T extends Pick<ScheduledMessage, 'route' | 'sendAt'>>(
  items: readonly T[],
  now: number
): T[] =>
  items
    .filter((m) => m.route === 'local' && m.sendAt <= now)
    .sort((a, b) => a.sendAt - b.sendAt);

/** Milliseconds until the next local message is due, undefined without one. */
export const nextDueIn = (
  items: readonly Pick<ScheduledMessage, 'route' | 'sendAt'>[],
  now: number
): number | undefined => {
  let next: number | undefined;
  items.forEach((m) => {
    if (m.route !== 'local') return;
    if (next === undefined || m.sendAt < next) next = m.sendAt;
  });
  return next === undefined ? undefined : Math.max(0, next - now);
};

/** A local message that went out well after its time. */
export const wasSentLate = (sendAt: number, sentAt: number): boolean =>
  sentAt - sendAt > LATE_AFTER_MS;

export type Reconciled<T> = {
  /** Local records that are still waiting (local route, or still scheduled on the server). */
  keep: T[];
  /** Server records the server no longer has: sent or cancelled elsewhere. */
  gone: T[];
  /** Scheduled on the server by another device (or before this device kept records). */
  others: ServerDelayedMessage[];
};

/**
 * Compares this device's records with the server's list. Only call it with a list the server
 * really returned: on an error nothing may be dropped. Records created at or after
 * `listRequestedAt` may be missing from a list that was asked for before they existed.
 */
export const reconcileWithServer = <
  T extends Pick<ScheduledMessage, 'route' | 'delayId' | 'createdAt'>
>(
  items: readonly T[],
  server: readonly ServerDelayedMessage[],
  listRequestedAt: number
): Reconciled<T> => {
  const serverIds = new Set(server.map((s) => s.delayId));
  const known = new Set<string>();
  const keep: T[] = [];
  const gone: T[] = [];
  items.forEach((m) => {
    if (m.route !== 'server' || !m.delayId) {
      keep.push(m);
      return;
    }
    known.add(m.delayId);
    if (serverIds.has(m.delayId) || m.createdAt >= listRequestedAt) keep.push(m);
    else gone.push(m);
  });
  return { keep, gone, others: server.filter((s) => !known.has(s.delayId)) };
};

/** The messages of one room, earliest first. */
export const inRoom = <T extends Pick<ScheduledMessage, 'roomId' | 'sendAt'>>(
  items: readonly T[],
  roomId: string
): T[] => items.filter((m) => m.roomId === roomId).sort((a, b) => a.sendAt - b.sendAt);

/** "1 scheduled message", "3 scheduled messages". */
export const scheduledCountLabel = (count: number): string =>
  `${count} scheduled message${count === 1 ? '' : 's'}`;

/** First line of the body, shortened, for the overview. */
export const messagePreview = (content: Record<string, unknown>, max = 80): string => {
  const body = typeof content.body === 'string' ? content.body : '';
  const line = body.split('\n').find((l) => l.trim() !== '') ?? '';
  const trimmed = line.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** "18:00" or "6:00 PM". */
export const formatClock = (ts: number, hour24: boolean): string => {
  const d = new Date(ts);
  const h = d.getHours();
  const m = pad(d.getMinutes());
  if (hour24) return `${pad(h)}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

const dayIndex = (ts: number): number => {
  const d = new Date(ts);
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);
};

/** "Today, 18:00", "Tomorrow, 09:00", "Mon 17 Nov, 09:00" (with the year when it differs). */
export const formatSendAt = (at: number, now: number, hour24: boolean): string => {
  const clock = formatClock(at, hour24);
  const days = dayIndex(at) - dayIndex(now);
  if (days === 0) return `Today, ${clock}`;
  if (days === 1) return `Tomorrow, ${clock}`;
  if (days === -1) return `Yesterday, ${clock}`;
  const d = new Date(at);
  const year = d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${clock}`;
};

/** "1 hour", "2 days", "30 minutes": the server's limit in the dialog. */
export const formatDuration = (ms: number): string => {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (ms >= DAY && ms % DAY === 0) return unit(ms / DAY, 'day');
  if (ms >= HOUR) return unit(Math.floor(ms / HOUR), 'hour');
  return unit(Math.max(1, Math.floor(ms / MINUTE)), 'minute');
};
