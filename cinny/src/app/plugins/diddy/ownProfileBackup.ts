/**
 * A copy of your own Diddy profile in your account data (OWN_PROFILE_EVENT), next to the copies in
 * the options rooms.
 *
 * Without an options room a profile could not be saved at all, so your own devices did not even
 * agree with each other. The account data reaches every device of the account on any server, so
 * now the profile is saved there first and shared with others through the options rooms once you
 * have one. It takes part in the "newest profile wins" pick (profilePick.ts) like a room, and a
 * newer copy here is copied into the rooms (profiles.ts, healOwnProfile). iOS reads and writes the
 * same event (`DiddyProfiles.swift`).
 *
 * `ts` is the time of the save on the saving device (account data has no server time).
 * Pure, no Matrix calls (tests/syncLogic.test.cjs).
 */
import type { StoredProfile } from './profilePick';

export const OWN_PROFILE_EVENT = 'app.diddy.my_profile';

/** A copy saved with a clock far ahead would win over every later change: such copies are ignored. */
const MAX_AHEAD_MS = 10 * 60 * 1000;

export const backupContent = (
  profile: Record<string, unknown>,
  ts: number
): { v: 1; ts: number; profile: Record<string, unknown> } => ({ v: 1, ts, profile });

/** The stored copy as a pick candidate, or undefined when there is none or it is unusable. */
export const parseBackup = (content: unknown, now: number): StoredProfile | undefined => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return undefined;
  const c = content as { ts?: unknown; profile?: unknown };
  const { ts, profile } = c;
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0 || ts > now + MAX_AHEAD_MS) {
    return undefined;
  }
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return undefined;
  return { content: profile, ts };
};
