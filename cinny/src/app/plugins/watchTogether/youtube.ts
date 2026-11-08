// Watch together (#83): YouTube links, the embed URL of the official player and the messages of
// its IFrame API. The player itself is never changed; we only talk to it through postMessage.

/** A YouTube video id: exactly 11 characters from the URL-safe base64 alphabet. */
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const isVideoId = (value: unknown): value is string =>
  typeof value === 'string' && VIDEO_ID_RE.test(value);

/** Longest start offset we accept from a link (24 h). */
export const MAX_START = 24 * 3600;

/** The privacy-enhanced embed host; youtube.com is accepted as message origin too. */
export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
export const PLAYER_ORIGINS: readonly string[] = [
  EMBED_ORIGIN,
  'https://www.youtube.com',
  'https://youtube.com',
];

export type VideoRef = { videoId: string; start: number };

/** "90", "90s", "1m30s", "1h2m3s" (YouTube's t= / start= formats) in whole seconds. */
export const parseStartTime = (value: string | null | undefined): number => {
  if (!value) return 0;
  const text = value.trim().toLowerCase();
  let seconds: number;
  if (/^\d+(\.\d+)?s?$/.test(text)) {
    seconds = Math.floor(parseFloat(text));
  } else {
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
    if (!match || text === '') return 0;
    const [, h, m, s] = match;
    seconds = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  }
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(seconds, MAX_START);
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);
const PATH_ID_PREFIXES = ['shorts', 'embed', 'live', 'v', 'e'];

/**
 * Reads a video id and an optional start time from what the user pasted: youtube.com/watch?v=,
 * youtu.be/, /shorts/, /embed/, /live/ (with or without scheme), or a bare 11-character id.
 * Anything else gives undefined.
 */
export const parseYouTubeUrl = (input: string): VideoRef | undefined => {
  const text = input.trim();
  if (!text || text.length > 2048) return undefined;
  if (isVideoId(text)) return { videoId: text, start: 0 };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  let videoId: string | undefined;
  if (host === 'youtu.be') {
    [videoId] = parts;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === 'watch') videoId = url.searchParams.get('v') ?? undefined;
    else if (parts.length >= 2 && PATH_ID_PREFIXES.includes(parts[0])) [, videoId] = parts;
  }
  if (!isVideoId(videoId)) return undefined;

  const hashT = /(?:^|[#&])t=([^&]+)/.exec(url.hash)?.[1];
  const start = parseStartTime(url.searchParams.get('t') ?? url.searchParams.get('start') ?? hashT);
  return { videoId, start };
};

/**
 * The embed URL of the official player. `origin` lets the player answer our postMessage calls,
 * `widget_referrer` tells YouTube where it is embedded (some videos refuse embeds without it).
 */
export const buildEmbedUrl = (videoId: string, origin: string, start = 0): string => {
  if (!isVideoId(videoId)) throw new Error('invalid video id');
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    iv_load_policy: '3',
  });
  if (origin && origin !== 'null') {
    params.set('origin', origin);
    params.set('widget_referrer', origin);
  }
  const from = Math.floor(start);
  if (from > 0 && from <= MAX_START) params.set('start', String(from));
  return `${EMBED_ORIGIN}/embed/${videoId}?${params.toString()}`;
};

export const watchUrl = (videoId: string): string =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

// --- IFrame API messages -----------------------------------------------------------------------

export const PlayerState = {
  Unstarted: -1,
  Ended: 0,
  Playing: 1,
  Paused: 2,
  Buffering: 3,
  Cued: 5,
} as const;

export type PlayerInfo = {
  currentTime?: number;
  duration?: number;
  playerState?: number;
  playbackRate?: number;
  playbackQuality?: string;
  availableQualityLevels?: string[];
};

export type PlayerMessage =
  | { event: 'ready' }
  | { event: 'state'; state: number }
  | { event: 'error'; code: number }
  | { event: 'rate'; rate: number }
  | { event: 'quality'; quality: string }
  | { event: 'info'; info: PlayerInfo };

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const QUALITY_RE = /^[a-z0-9_]{1,16}$/;

const readInfo = (raw: unknown): PlayerInfo => {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const info: PlayerInfo = {};
  const currentTime = finite(r.currentTime);
  if (currentTime !== undefined && currentTime >= 0) info.currentTime = currentTime;
  const duration = finite(r.duration);
  if (duration !== undefined && duration >= 0) info.duration = duration;
  const state = finite(r.playerState);
  if (state !== undefined) info.playerState = state;
  const rate = finite(r.playbackRate);
  if (rate !== undefined && rate > 0) info.playbackRate = rate;
  if (typeof r.playbackQuality === 'string' && QUALITY_RE.test(r.playbackQuality)) {
    info.playbackQuality = r.playbackQuality;
  }
  if (Array.isArray(r.availableQualityLevels)) {
    info.availableQualityLevels = r.availableQualityLevels
      .filter((q): q is string => typeof q === 'string' && QUALITY_RE.test(q))
      .slice(0, 16);
  }
  return info;
};

/** Reads one message the player posted to us (a JSON string); unknown messages give undefined. */
export const parsePlayerMessage = (data: unknown): PlayerMessage | undefined => {
  if (typeof data !== 'string' || data.length > 100_000) return undefined;
  let msg: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') return undefined;
    msg = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  switch (msg.event) {
    case 'onReady':
      return { event: 'ready' };
    case 'onStateChange': {
      const state = finite(msg.info);
      return state === undefined ? undefined : { event: 'state', state };
    }
    case 'onError': {
      const code = finite(msg.info);
      return code === undefined ? undefined : { event: 'error', code };
    }
    case 'onPlaybackRateChange': {
      const rate = finite(msg.info);
      return rate === undefined || rate <= 0 ? undefined : { event: 'rate', rate };
    }
    case 'onPlaybackQualityChange':
      return typeof msg.info === 'string' && QUALITY_RE.test(msg.info)
        ? { event: 'quality', quality: msg.info }
        : undefined;
    case 'initialDelivery':
    case 'infoDelivery':
      return { event: 'info', info: readInfo(msg.info) };
    default:
      return undefined;
  }
};

/** A command for the player, in the format the IFrame API uses. */
export const playerCommand = (func: string, args: unknown[] = []): string =>
  JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' });

export const LISTENING_MESSAGE = JSON.stringify({ event: 'listening', id: 1, channel: 'widget' });

/** Human text for the player's error codes. */
export const playerErrorText = (code: number): string => {
  switch (code) {
    case 2:
      return 'This link does not point to a valid video.';
    case 5:
      return 'The player cannot play this video here.';
    case 100:
      return 'The video was removed or is private.';
    case 101:
    case 150:
      return 'The owner of this video does not allow playing it outside YouTube.';
    case 152:
    case 153:
      return 'YouTube refused to play the video inside the app (embed configuration).';
    default:
      return `YouTube could not play the video (error ${code}).`;
  }
};

/** Quality levels the user can ask for; YouTube treats the choice as a hint at most. */
export const QUALITY_CHOICES = [
  'auto',
  'small',
  'medium',
  'large',
  'hd720',
  'hd1080',
  'highres',
] as const;
export type QualityChoice = typeof QUALITY_CHOICES[number];

export const QUALITY_LABELS: Record<string, string> = {
  auto: 'Auto',
  tiny: '144p',
  small: '240p',
  medium: '360p',
  large: '480p',
  hd720: '720p',
  hd1080: '1080p',
  hd1440: '1440p',
  hd2160: '2160p',
  highres: 'Highest',
};
