/**
 * The profile picture is the normal Matrix avatar (#93). Diddy used to keep its own animated
 * avatar in the Diddy profile; that is gone. A GIF / WebP / APNG is now uploaded unchanged as the
 * Matrix avatar, and avatars ask the server for animated thumbnails.
 *
 * Pure helpers without imports, so the unit tests can load this file directly.
 */

/** Picture types accepted as profile picture. SVG is refused (scripts, no thumbnails). */
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/apng'];
export const AVATAR_ACCEPT = AVATAR_TYPES.join(',');

/** Types that can move: they must never be re-encoded or cropped through a canvas. */
export const isAnimatableType = (type: string): boolean =>
  type === 'image/gif' || type === 'image/webp' || type === 'image/apng';

const formatMb = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.floor(mb)} MB` : `${Math.floor(mb * 10) / 10} MB`;
};

export type AvatarFileCheck = { ok: true } | { ok: false; error: string };

/**
 * Checks a picture before it is uploaded. `maxBytes` is the server's upload limit, undefined when
 * the server does not tell it (the server then refuses too large files itself).
 */
export const checkAvatarFile = (
  file: { type: string; size: number },
  maxBytes?: number
): AvatarFileCheck => {
  if (!AVATAR_TYPES.includes(file.type)) {
    return { ok: false, error: 'Please choose a PNG, JPG, GIF, WebP or APNG picture.' };
  }
  if (file.size <= 0) return { ok: false, error: 'This file is empty.' };
  if (typeof maxBytes === 'number' && maxBytes > 0 && file.size > maxBytes) {
    return {
      ok: false,
      error: `This picture is ${formatMb(file.size)}, your server allows at most ${formatMb(
        maxBytes
      )}.`,
    };
  }
  return { ok: true };
};

/** Readable text for a failed avatar upload / avatar change. */
export const avatarErrorMessage = (e: unknown, maxBytes?: number): string => {
  const err = (e ?? {}) as { errcode?: string; httpStatus?: number; message?: string };
  if (err.errcode === 'M_TOO_LARGE' || err.httpStatus === 413) {
    return maxBytes
      ? `The picture is too large for your server (at most ${formatMb(maxBytes)}).`
      : 'The picture is too large for your server.';
  }
  if (err.errcode === 'M_LIMIT_EXCEEDED' || err.httpStatus === 429) {
    return 'Too many uploads right now. Try again in a moment.';
  }
  if (err.errcode === 'M_FORBIDDEN' || err.httpStatus === 403) {
    return 'Your server does not allow changing the profile picture.';
  }
  if (err.errcode === 'M_NOT_FOUND' || err.httpStatus === 404) {
    return 'The picture no longer exists on your server.';
  }
  if (typeof err.message === 'string' && err.message) return err.message;
  return 'Could not change the profile picture.';
};

/** The part of the Matrix client the avatar upload needs. */
export type AvatarClient = {
  uploadContent: (
    file: Blob,
    opts: { type: string; name?: string }
  ) => Promise<{ content_uri: string }>;
  setAvatarUrl: (url: string) => Promise<unknown>;
};

/**
 * Uploads the picture exactly as chosen (an animated GIF / WebP / APNG keeps its frames, nothing is
 * drawn to a canvas or re-encoded) and makes it the Matrix avatar. Returns the new mxc:// url.
 */
export const uploadMatrixAvatar = async (
  mx: AvatarClient,
  file: File,
  maxBytes?: number
): Promise<string> => {
  const check = checkAvatarFile(file, maxBytes);
  if (!check.ok) throw new Error(check.error);
  let mxc: string;
  try {
    const res = await mx.uploadContent(file, { type: file.type, name: file.name });
    mxc = res.content_uri;
  } catch (e) {
    throw new Error(avatarErrorMessage(e, maxBytes));
  }
  if (typeof mxc !== 'string' || !mxc.startsWith('mxc://')) {
    throw new Error('The server did not accept the picture.');
  }
  try {
    await mx.setAvatarUrl(mxc);
  } catch (e) {
    throw new Error(avatarErrorMessage(e, maxBytes));
  }
  return mxc;
};

/**
 * Asks for an animated thumbnail (Matrix 1.11 `animated=true`): without it servers flatten a GIF
 * to its first frame. Servers that do not know the parameter ignore it. Only thumbnail urls are
 * changed; a full download is already the original file.
 */
export const animatedThumbnailUrl = (src: string): string => {
  try {
    const url = new URL(src);
    if (!/\/thumbnail\//.test(url.pathname)) return src;
    if (url.searchParams.get('animated') === 'true') return src;
    url.searchParams.set('animated', 'true');
    return url.toString();
  } catch {
    return src;
  }
};

/** A media download url (the original file), not a server-made thumbnail. */
export const isOriginalMedia = (src: string): boolean => {
  try {
    return /\/download\//.test(new URL(src).pathname);
  } catch {
    return false;
  }
};

// --- migration of the old Diddy avatar ----------------------------------------------------------

export type LegacyAvatarInput = {
  /** the old Diddy profile avatar (mxc://), read from the stored profile */
  legacyMxc?: string;
  /** the current Matrix avatar_url */
  matrixMxc?: string;
  /** legacy avatars the user already answered (used or dismissed) on this device */
  answered: string[];
};

/**
 * Whether Settings > Profile offers to make the old Diddy picture the Matrix picture: only when
 * there is one, it is not already the Matrix picture, and the user has not answered for it yet.
 */
export const shouldOfferLegacyAvatar = ({
  legacyMxc,
  matrixMxc,
  answered,
}: LegacyAvatarInput): boolean => {
  if (typeof legacyMxc !== 'string' || !legacyMxc.startsWith('mxc://')) return false;
  if (legacyMxc === matrixMxc) return false;
  return !answered.includes(legacyMxc);
};

const ANSWERED_KEY = 'diddyLegacyAvatarAnswered';

const readAnsweredMap = (): Record<string, string[]> => {
  try {
    const raw = JSON.parse(localStorage.getItem(ANSWERED_KEY) ?? '{}') as unknown;
    return raw && typeof raw === 'object' ? (raw as Record<string, string[]>) : {};
  } catch {
    return {};
  }
};

/** Legacy avatars this user already answered on this device. */
export const readAnsweredLegacyAvatars = (userId: string): string[] => {
  const list = readAnsweredMap()[userId];
  return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
};

export const markLegacyAvatarAnswered = (userId: string, mxc: string): void => {
  const map = readAnsweredMap();
  const list = readAnsweredLegacyAvatars(userId);
  if (!list.includes(mxc)) map[userId] = [...list, mxc].slice(-8);
  try {
    localStorage.setItem(ANSWERED_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable: the notice may show again next start
  }
};
