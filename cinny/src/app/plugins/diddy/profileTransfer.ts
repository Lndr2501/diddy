import { sanitizeProfile } from './sanitize';
import { ProfileDraft, toDraft } from './profilePreview';

/**
 * Export / import of the profile customization (#157): save the editor's settings to a file and
 * load them again on another device or account.
 *
 * Only the look and the texts are carried: name style, card, nameplate, effect, frame, bio, facts,
 * interests, links, activity and card layout. Never the chosen status (that is per account and per
 * moment) and never the Diddy version. Pictures stay references (mxc://) to the media on the
 * server they were uploaded to, so they show wherever that server's media can be fetched; a
 * private server of someone else may not serve them.
 *
 * An imported file is untrusted: everything goes through the same sanitiser as profiles from the
 * sync, and it only fills the editor draft; nothing is saved until the user presses Save.
 */

export const PROFILE_FILE_KIND = 'diddy-profile-customization';
export const PROFILE_FILE_NAME = 'diddy-profile.json';
/** An exported profile is a few kilobytes; anything much bigger is not one. */
export const MAX_PROFILE_FILE_BYTES = 256 * 1024;

const PER_ACCOUNT_KEYS = ['status', 'clientVersion'] as const;

/** The draft without what must not travel between accounts. */
const portable = (draft: ProfileDraft): ProfileDraft => {
  const copy: Record<string, unknown> = JSON.parse(JSON.stringify(draft));
  PER_ACCOUNT_KEYS.forEach((key) => {
    delete copy[key];
  });
  return copy as ProfileDraft;
};

/** The text of the file for `draft`. */
export const exportProfile = (draft: ProfileDraft): string =>
  JSON.stringify({ kind: PROFILE_FILE_KIND, v: 1, profile: { v: 1, ...portable(draft) } }, null, 2);

export type ProfileImport = { ok: true; draft: ProfileDraft } | { ok: false; error: string };

/** Reads a file's text back into a draft; never throws. */
export const importProfile = (text: string): ProfileImport => {
  if (new TextEncoder().encode(text).length > MAX_PROFILE_FILE_BYTES) {
    return { ok: false, error: 'This file is too big to be a Diddy profile.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a Diddy profile file (not valid JSON).' };
  }
  const file = raw as { kind?: unknown; v?: unknown; profile?: unknown } | null;
  // the wrapper written by exportProfile, or a bare profile object ({ v: 1, ... })
  const candidate = file && file.kind === PROFILE_FILE_KIND ? file.profile : raw;
  const profile = sanitizeProfile(candidate);
  if (!profile) return { ok: false, error: 'This is not a Diddy profile file.' };
  const draft = portable(toDraft(profile));
  if (Object.keys(draft).length === 0) {
    return { ok: false, error: 'The file contains no profile settings.' };
  }
  return { ok: true, draft };
};
