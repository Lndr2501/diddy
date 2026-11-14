/**
 * Music cards: a song shared from Apple Music or Spotify (iOS share sheet), drawn like iMessage's
 * lyrics card. A normal text message carries the plain text (`body`: lines, title, link) for every
 * other client and the card in `content["app.diddy.music"]`. Same rules as the iOS side
 * (ios/Diddy/Matrix/MusicCard.swift). Untrusted input: strings cut, images only mxc://, links only
 * https, preview audio only from the services' audio hosts. No imports, so it is unit tested.
 */
export const MUSIC_KEY = 'app.diddy.music';
export const MUSIC_MAX_LINES = 8;

export type MusicService = 'apple' | 'spotify' | 'other';

export type MusicCard = {
  title: string;
  artist?: string;
  album?: string;
  url: string;
  artwork?: string;
  preview?: string;
  lyrics: string[];
  /** where the first line starts in the song, seconds */
  time?: number;
  service: MusicService;
};

const MXC = /^mxc:\/\/[^/\s]{1,255}\/[^/\s]{1,255}$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!clean) return undefined;
  return clean.length > max ? clean.slice(0, max) : clean;
};

const httpsUrl = (v: unknown): URL | undefined => {
  if (typeof v !== 'string' || v.length > 2000) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname ? u : undefined;
  } catch {
    return undefined;
  }
};

/** Preview audio only from Apple's or Spotify's audio hosts. */
export const previewAllowed = (url: string): boolean => {
  const u = httpsUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  return host.endsWith('.itunes.apple.com') || host.endsWith('.mzstatic.com') || host === 'p.scdn.co';
};

/** The card of a message content, or undefined when there is none or it is not valid. */
export const parseMusicCard = (content: unknown): MusicCard | undefined => {
  if (!isObject(content)) return undefined;
  const raw = content[MUSIC_KEY];
  if (!isObject(raw) || raw.v !== 1) return undefined;
  const title = text(raw.title, 200);
  const url = httpsUrl(raw.url);
  if (!title || !url) return undefined;
  const lyrics = Array.isArray(raw.lyrics)
    ? raw.lyrics
        .map((l) => text(l, 200))
        .filter((l): l is string => !!l)
        .slice(0, MUSIC_MAX_LINES)
    : [];
  const time =
    typeof raw.time === 'number' && Number.isFinite(raw.time) && raw.time >= 0 && raw.time < 86400
      ? raw.time
      : undefined;
  const preview = typeof raw.preview === 'string' && previewAllowed(raw.preview) ? raw.preview : undefined;
  return {
    title,
    artist: text(raw.artist, 200),
    album: text(raw.album, 200),
    url: url.toString(),
    artwork: typeof raw.artwork === 'string' && MXC.test(raw.artwork) ? raw.artwork : undefined,
    preview,
    lyrics,
    time,
    service: raw.service === 'apple' || raw.service === 'spotify' ? raw.service : 'other',
  };
};

/** "1:05" for the time a line starts. */
export const musicClock = (seconds: number): string => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
