import { isVideoId, MAX_START } from './youtube';

// Watch together (#83): SponsorBlock (https://sponsor.ajay.app, community data, CC BY-NC-SA 4.0).
// Privacy: we ask for the first 4 hex characters of sha256(videoId) only and pick our video from
// the answer, so the server does not learn which video is watched.

export const SPONSORBLOCK_API = 'https://sponsor.ajay.app';

export const SPONSOR_CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
  'preview',
  'music_offtopic',
  'filler',
] as const;
export type SponsorCategory = typeof SPONSOR_CATEGORIES[number];

export const DEFAULT_CATEGORIES: SponsorCategory[] = ['sponsor', 'selfpromo', 'interaction'];

export const CATEGORY_LABELS: Record<SponsorCategory, string> = {
  sponsor: 'Sponsor',
  selfpromo: 'Self promotion',
  interaction: 'Interaction reminder (subscribe, like)',
  intro: 'Intro animation',
  outro: 'Endcards and credits',
  preview: 'Preview and recap',
  music_offtopic: 'Non-music part in music videos',
  filler: 'Filler tangent',
};

export const isSponsorCategory = (value: unknown): value is SponsorCategory =>
  typeof value === 'string' && (SPONSOR_CATEGORIES as readonly string[]).includes(value);

export type SkipSegment = { start: number; end: number; category: SponsorCategory; uuid: string };

type Digest = (data: Uint8Array) => Promise<ArrayBuffer>;

const defaultDigest: Digest = (data) => crypto.subtle.digest('SHA-256', data);

/** First 4 hex characters of sha256(videoId). */
export const hashPrefix = async (videoId: string, digest: Digest = defaultDigest) => {
  const hash = new Uint8Array(await digest(new TextEncoder().encode(videoId)));
  return Array.from(hash.slice(0, 2), (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Picks the skippable segments of one video out of a hash-prefix answer. */
export const selectSegments = (
  body: unknown,
  videoId: string,
  categories: readonly string[]
): SkipSegment[] => {
  if (!Array.isArray(body)) return [];
  const entry = body.find(
    (item) =>
      item && typeof item === 'object' && (item as { videoID?: unknown }).videoID === videoId
  ) as { segments?: unknown } | undefined;
  if (!entry || !Array.isArray(entry.segments)) return [];
  const segments: SkipSegment[] = [];
  entry.segments.slice(0, 200).forEach((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const s = raw as Record<string, unknown>;
    if (!isSponsorCategory(s.category) || !categories.includes(s.category)) return;
    if (s.actionType !== undefined && s.actionType !== 'skip') return;
    if (!Array.isArray(s.segment) || s.segment.length !== 2) return;
    const [start, end] = s.segment as unknown[];
    if (typeof start !== 'number' || typeof end !== 'number') return;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    if (start < 0 || end > MAX_START || end - start < 1) return;
    segments.push({
      start,
      end,
      category: s.category,
      uuid: typeof s.UUID === 'string' ? s.UUID.slice(0, 128) : `${start}-${end}`,
    });
  });
  return segments.sort((a, b) => a.start - b.start);
};

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Loads the segments to skip for a video. Any failure (offline, blocked, 404 = no segments)
 * gives an empty list: skipping is a nice extra, never a reason for an error.
 */
export const fetchSegments = async (
  videoId: string,
  categories: readonly string[],
  fetchFn?: Fetch,
  digest?: Digest
): Promise<SkipSegment[]> => {
  const get: Fetch = fetchFn ?? ((url, init) => fetch(url, init));
  if (!isVideoId(videoId) || categories.length === 0) return [];
  try {
    const prefix = await hashPrefix(videoId, digest);
    const query = new URLSearchParams({
      categories: JSON.stringify(categories.filter(isSponsorCategory)),
      actionTypes: JSON.stringify(['skip']),
    });
    const res = await get(`${SPONSORBLOCK_API}/api/skipSegments/${prefix}?${query}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return [];
    return selectSegments(await res.json(), videoId, categories);
  } catch {
    return [];
  }
};

/** Stop skipping this close to the end of a segment (already past it, practically). */
const END_MARGIN = 0.5;

/**
 * The segment to skip at `position`, unless it was skipped already. `skipped` remembers skipped
 * segments; a segment counts again once the position is before its start (someone seeked back).
 */
export const segmentToSkip = (
  segments: readonly SkipSegment[],
  position: number,
  skipped: Set<string>
): SkipSegment | undefined => {
  segments.forEach((s) => {
    if (position < s.start - 1) skipped.delete(s.uuid);
  });
  return segments.find(
    (s) => position >= s.start && position < s.end - END_MARGIN && !skipped.has(s.uuid)
  );
};
