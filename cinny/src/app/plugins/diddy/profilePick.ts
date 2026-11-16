/**
 * Which stored profile of a person counts when several options rooms hold one (#207).
 *
 * Every device keeps its own list of "light" options rooms (rooms used without the marker), so
 * two devices of the same account can see different sets of options rooms. With "the first room
 * wins" a phone could keep showing an older profile from a room the desktop does not even read,
 * while the desktop wrote the new one into its own first room. The newest valid profile written
 * by the person themselves wins instead, wherever it is; on equal times the room order decides.
 * iOS does the same (`DiddyProfiles.swift`).
 */

export type StoredProfile = { content: unknown; ts: number };

/**
 * The newest candidate that `sanitize` accepts, with its content sanitized. `candidates` holds the
 * newest own profile of each options room in room order (undefined where a room has none).
 */
export const pickNewestProfile = <T>(
  candidates: ReadonlyArray<StoredProfile | undefined>,
  sanitize: (content: unknown) => T | undefined
): T | undefined => {
  let best: { profile: T; ts: number } | undefined;
  candidates.forEach((candidate) => {
    if (!candidate || !Number.isFinite(candidate.ts)) return;
    if (best && candidate.ts <= best.ts) return;
    const profile = sanitize(candidate.content);
    if (profile !== undefined) best = { profile, ts: candidate.ts };
  });
  return best?.profile;
};

/** Same JSON whatever the key order (sanitized profiles are compared, not raw events). */
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/**
 * Which rooms hold an older or different copy of the newest profile (or none at all), so the
 * newest one can be copied there. `newest` is the index of the winning room, undefined when no
 * room holds a valid profile (then nothing is copied anywhere).
 */
export const staleProfileRooms = <T>(
  candidates: ReadonlyArray<StoredProfile | undefined>,
  sanitize: (content: unknown) => T | undefined
): { newest?: number; stale: number[] } => {
  let newest: number | undefined;
  let best: { profile: T; ts: number } | undefined;
  candidates.forEach((candidate, i) => {
    if (!candidate || !Number.isFinite(candidate.ts)) return;
    if (best && candidate.ts <= best.ts) return;
    const profile = sanitize(candidate.content);
    if (profile !== undefined) {
      best = { profile, ts: candidate.ts };
      newest = i;
    }
  });
  if (!best || newest === undefined) return { stale: [] };
  const want = stableJson(best.profile);
  const stale: number[] = [];
  candidates.forEach((candidate, i) => {
    if (i === newest) return;
    const profile = candidate ? sanitize(candidate.content) : undefined;
    if (profile === undefined || stableJson(profile) !== want) stale.push(i);
  });
  return { newest, stale };
};
