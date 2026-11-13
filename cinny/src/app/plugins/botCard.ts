/**
 * Bot cards: a bot (the music bot) sends a normal message (`body` stays as the plain text for every
 * other client) plus structured data in `content["dev.diddy.card"]`. Diddy draws a card from it.
 * Everything here is untrusted input from the network: only known kinds, strings are cut, numbers
 * must be finite, images only as mxc:// uris, links only http(s). No imports, so it is unit tested.
 * Protocol description: docs/bot-cards.md
 */
export const CARD_KEY = 'dev.diddy.card';
/** Set on the message a card button / the timeline sends, so Diddy does not show it in the chat. */
export const CARD_ACTION_KEY = 'dev.diddy.card_action';

export type CardTone = 'info' | 'success' | 'warning' | 'error';
export type TrackState = 'searching' | 'downloading' | 'playing' | 'paused' | 'stopped' | 'error';

export type CardAction = { label: string; send: string };
export type QueueItem = { title: string; artist?: string; duration?: number };
export type HelpItem = { usage: string; desc: string };
export type HelpGroup = { title: string; items: HelpItem[] };
export type ListItem = { title: string; subtitle?: string; duration?: number };
export type ChartItem = { label: string; value: number; sub?: string };
export type Chart = { title: string; unit?: string; items: ChartItem[] };
export type UpNextItem = { title: string; artist?: string };
/**
 * Player buttons of a track card. When present, Diddy draws the player layout and ignores
 * `actions` (older clients keep using `actions`, so a bot sends both).
 */
export type PlayerControls = {
  prev?: string;
  /** "!pause" while playing, "!resume" while paused */
  toggle?: string;
  skip?: string;
  /** command prefix: the volume slider sends `<volume> N` */
  volume?: string;
  /** opens the bot's web dashboard (the bot answers with a personal link) */
  dashboard?: string;
};

export type BotCard =
  | {
      kind: 'track';
      state: TrackState;
      title: string;
      artist?: string;
      /** length in seconds */
      duration?: number;
      /** position in seconds at `startedAt` */
      position?: number;
      /** bot clock (epoch ms) when `position` was measured, lets the client run the bar itself */
      startedAt?: number;
      thumbnail?: string;
      url?: string;
      source?: string;
      note?: string;
      /** bot command for the timeline: a click sends `<seek> <mm:ss>`, arrow keys `<seek> -10` / `+10` */
      seek?: string;
      /** current volume of the bot (shown next to the times) */
      volume?: number;
      actions: CardAction[];
      /** room name for the "Now playing in" header */
      room?: string;
      /** display name of whoever asked for the track ("Autoplay" for autoplay picks) */
      requestedBy?: string;
      upNext?: UpNextItem[];
      controls?: PlayerControls;
      /** upper end of the volume slider (default 100) */
      volumeMax?: number;
      /** extra commands in the "⋯" menu of the player */
      more?: CardAction[];
    }
  | { kind: 'queue'; now?: QueueItem; items: QueueItem[]; total: number; actions: CardAction[] }
  | { kind: 'help'; groups: HelpGroup[]; note?: string }
  | {
      kind: 'list';
      title: string;
      items: ListItem[];
      total: number;
      empty?: string;
      actions: CardAction[];
    }
  | { kind: 'stats'; title: string; charts: Chart[]; actions: CardAction[] }
  | {
      kind: 'note';
      text: string;
      tone: CardTone;
      icon?: string;
      /** http(s) link shown as a small button in the chip (e.g. the created GitHub issue) */
      url?: string;
      linkLabel?: string;
    };

const TRACK_STATES: TrackState[] = [
  'searching',
  'downloading',
  'playing',
  'paused',
  'stopped',
  'error',
];
const TONES: CardTone[] = ['info', 'success', 'warning', 'error'];
const MXC = /^mxc:\/\/[^/\s]{1,255}\/[^/\s]{1,255}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Printable text, single piece, cut to `max` characters. */
const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const num = (v: unknown, max = 1e9): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;

const httpUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || v.length > 2000) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
};

const actions = (v: unknown, max = 10): CardAction[] => {
  if (!Array.isArray(v)) return [];
  const out: CardAction[] = [];
  v.slice(0, max).forEach((a) => {
    if (!isObject(a)) return;
    const label = text(a.label, 24);
    const send = text(a.send, 120);
    // a button only types a bot command into the chat for you: it has to look like one
    if (label && send && /^[!/][^\s]/.test(send)) out.push({ label, send });
  });
  return out;
};

/** Most entries in the "⋯" menu of the player card. */
export const MORE_MAX = 16;

// A player button's command. It must still look like a card action after Diddy appends one
// argument (the volume), so `isCardActionMessage` hides it in the chat.
const COMMAND = /^[!/][^\s]{1,30}( [^\s]{1,20})?$/;
const command = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length <= 60 && COMMAND.test(v) ? v : undefined;

const controls = (v: unknown): PlayerControls | undefined => {
  if (!isObject(v)) return undefined;
  const out: PlayerControls = {};
  (['prev', 'toggle', 'skip', 'volume', 'dashboard'] as const).forEach((k) => {
    const c = command(v[k]);
    if (c) out[k] = c;
  });
  return out;
};

const upNext = (v: unknown): UpNextItem[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out: UpNextItem[] = [];
  v.slice(0, 20).forEach((i) => {
    if (!isObject(i) || out.length >= 3) return;
    const title = text(i.title, 160);
    if (title) out.push({ title, artist: text(i.artist, 120) });
  });
  return out;
};

const queueItem = (v: unknown): QueueItem | undefined => {
  if (!isObject(v)) return undefined;
  const title = text(v.title, 160);
  if (!title) return undefined;
  return { title, artist: text(v.artist, 120), duration: num(v.duration, 86400 * 7) };
};

/** The card of a message content, or undefined when there is none or it is not valid. */
export const parseBotCard = (content: unknown): BotCard | undefined => {
  if (!isObject(content)) return undefined;
  const raw = content[CARD_KEY];
  if (!isObject(raw) || raw.v !== 1) return undefined;

  if (raw.kind === 'track') {
    const title = text(raw.title, 200);
    const state = TRACK_STATES.find((s) => s === raw.state);
    if (!title || !state) return undefined;
    const thumb =
      typeof raw.thumbnail === 'string' && MXC.test(raw.thumbnail) ? raw.thumbnail : undefined;
    return {
      kind: 'track',
      state,
      title,
      artist: text(raw.artist, 120),
      duration: num(raw.duration, 86400 * 7),
      position: num(raw.position, 86400 * 7),
      startedAt: num(raw.startedAt, 4e12),
      thumbnail: thumb,
      url: httpUrl(raw.url),
      source: text(raw.source, 30),
      note: text(raw.note, 200),
      seek:
        typeof raw.seek === 'string' && /^[!/][^\s]{1,30}$/.test(raw.seek) ? raw.seek : undefined,
      volume: num(raw.volume, 1000),
      actions: actions(raw.actions),
      room: text(raw.room, 80),
      requestedBy: text(raw.requestedBy, 80),
      upNext: upNext(raw.upNext),
      controls: controls(raw.controls),
      volumeMax: num(raw.volumeMax, 1000) || undefined,
      // the "⋯" menu holds all other functions of the bot, so it takes more than the 10 buttons
      more: Array.isArray(raw.more) ? actions(raw.more, MORE_MAX) : undefined,
    };
  }

  if (raw.kind === 'queue') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .slice(0, 50)
      .map(queueItem)
      .filter((i): i is QueueItem => !!i);
    const total = num(raw.total, 1e6) ?? items.length;
    return { kind: 'queue', now: queueItem(raw.now), items, total, actions: actions(raw.actions) };
  }

  if (raw.kind === 'help') {
    const groups: HelpGroup[] = [];
    (Array.isArray(raw.groups) ? raw.groups : []).slice(0, 12).forEach((g) => {
      if (!isObject(g)) return;
      const title = text(g.title, 60);
      const items: HelpItem[] = [];
      (Array.isArray(g.items) ? g.items : []).slice(0, 20).forEach((i) => {
        if (!isObject(i)) return;
        const usage = text(i.usage, 120);
        const desc = text(i.desc, 200);
        if (usage && desc) items.push({ usage, desc });
      });
      if (title && items.length) groups.push({ title, items });
    });
    if (!groups.length) return undefined;
    return { kind: 'help', groups, note: text(raw.note, 400) };
  }

  if (raw.kind === 'list') {
    const title = text(raw.title, 100);
    if (!title) return undefined;
    const items: ListItem[] = [];
    (Array.isArray(raw.items) ? raw.items : []).slice(0, 50).forEach((i) => {
      if (!isObject(i)) return;
      const t = text(i.title, 160);
      if (t)
        items.push({
          title: t,
          subtitle: text(i.subtitle, 120),
          duration: num(i.duration, 86400 * 7),
        });
    });
    return {
      kind: 'list',
      title,
      items,
      total: num(raw.total, 1e6) ?? items.length,
      empty: text(raw.empty, 200),
      actions: actions(raw.actions),
    };
  }

  if (raw.kind === 'stats') {
    const title = text(raw.title, 100);
    const charts: Chart[] = [];
    (Array.isArray(raw.charts) ? raw.charts : []).slice(0, 6).forEach((c) => {
      if (!isObject(c)) return;
      const ct = text(c.title, 80);
      const items: ChartItem[] = [];
      (Array.isArray(c.items) ? c.items : []).slice(0, 15).forEach((i) => {
        if (!isObject(i)) return;
        const label = text(i.label, 120);
        const value = num(i.value, 1e12);
        if (label && value !== undefined) items.push({ label, value, sub: text(i.sub, 60) });
      });
      if (ct && items.length) charts.push({ title: ct, unit: text(c.unit, 12), items });
    });
    if (!title || !charts.length) return undefined;
    return { kind: 'stats', title, charts, actions: actions(raw.actions) };
  }

  if (raw.kind === 'note') {
    const body = text(raw.text, 300);
    if (!body) return undefined;
    const tone = TONES.find((t) => t === raw.tone) ?? 'info';
    const url = httpUrl(raw.url);
    return {
      kind: 'note',
      text: body,
      tone,
      icon: text(raw.icon, 8),
      url,
      linkLabel: url ? text(raw.linkLabel, 40) : undefined,
    };
  }

  return undefined;
};

/** 3:17 or 1:02:03 */
export const formatCardTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

/** Playback position of a "playing" track card now, in seconds (clamped to the length). */
export const livePosition = (
  card: { position?: number; startedAt?: number; duration?: number; state: string },
  now: number
): number | undefined => {
  if (card.position === undefined) return undefined;
  const elapsed =
    card.state === 'playing' && card.startedAt !== undefined
      ? Math.max(0, (now - card.startedAt) / 1000)
      : 0;
  const pos = card.position + elapsed;
  return card.duration !== undefined ? Math.min(pos, card.duration) : pos;
};

/**
 * A command that a card button sent for you ("!pause", "!seek 1:23", "!volume -10"): Diddy hides it
 * in the timeline, the card itself changes instead. The flag alone is not enough: anybody could set it
 * on any message, so only short bot-command-shaped texts count (a real message is never hidden).
 */
export const isCardActionMessage = (content: unknown): boolean => {
  if (!isObject(content) || content[CARD_ACTION_KEY] !== true || content.msgtype !== 'm.text') {
    return false;
  }
  const { body } = content;
  return (
    typeof body === 'string' &&
    body.length <= 60 &&
    /^[!/][^\s]{1,30}( [^\s]{1,20}){0,2}$/.test(body)
  );
};
