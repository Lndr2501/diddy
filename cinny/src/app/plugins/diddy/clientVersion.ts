/**
 * Which Diddy version someone runs (#75).
 *
 * Every Diddy client writes its own version into its profile (`clientVersion`, in the hidden
 * options room like the rest of the profile), so other Diddy clients can show it small on the
 * profile card. Only Diddy users have such a profile; other Matrix clients show nothing.
 * Switched off ("Show my Diddy version" in the profile privacy settings), the field is removed.
 *
 * Pure logic, no React or Matrix: tested in tests/clientVersion.test.cjs.
 */
import type { DiddyProfile } from './types';

/** 1.3.2, 10.0.0-beta.1 ... (no "v", nothing else: the value is shown to other people). */
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.]{1,24})?$/;

/** A version string that is safe and short enough to show, or undefined. */
export const safeVersion = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length <= 40 && VERSION.test(v) ? v : undefined;

/**
 * The profile as this client writes it: with `version` when you share it, without the field
 * otherwise. Returns a copy.
 */
export const stampClientVersion = (
  profile: DiddyProfile,
  version: string | undefined
): DiddyProfile => {
  const rest = { ...profile };
  delete rest.clientVersion;
  const shared = safeVersion(version);
  return shared ? { ...rest, clientVersion: shared } : rest;
};

/**
 * True when your stored profile does not say what it should: another version than this client,
 * or a version although you switched sharing off. Without a stored profile only when there is a
 * version to share.
 */
export const clientVersionOutdated = (
  profile: DiddyProfile | undefined,
  version: string | undefined
): boolean => (profile?.clientVersion ?? undefined) !== safeVersion(version);
