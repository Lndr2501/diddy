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
