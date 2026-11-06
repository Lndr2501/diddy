import { MatrixClient } from 'matrix-js-sdk';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { safeMxc } from './sanitize';

export const MAX_DIDDY_MEDIA_BYTES = 8 * 1024 * 1024;

/** Uploads a file to the Matrix media repo and returns its mxc:// url. */
export const uploadDiddyMedia = async (mx: MatrixClient, file: File): Promise<string> => {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new Error('Please choose a PNG, JPG, GIF or WebP image.');
  }
  let maxBytes = MAX_DIDDY_MEDIA_BYTES;
  try {
    const config = await mx.getMediaConfig();
    const serverMax = config['m.upload.size'];
    if (typeof serverMax === 'number' && serverMax > 0) maxBytes = Math.min(maxBytes, serverMax);
  } catch {
    // unknown server limit: keep the default
  }
  if (file.size > maxBytes) {
    throw new Error(`File too large (max ${Math.max(1, Math.floor(maxBytes / (1024 * 1024)))} MB)`);
  }
  const res = await mx.uploadContent(file, { type: file.type });
  return res.content_uri;
};

/** Converts an mxc:// url to an http(s) url (authenticated media aware). */
export const useMxcUrl = (
  mxc: string | undefined,
  size?: { w: number; h: number },
  options?: { animated?: boolean }
): string | undefined => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  // remote data is untrusted: only well-formed mxc:// uris become urls
  const safe = safeMxc(mxc);
  if (!safe) return undefined;
  return (
    mxcUrlToHttp(
      mx,
      safe,
      useAuthentication,
      size && !options?.animated ? size.w : undefined,
      size && !options?.animated ? size.h : undefined,
      size && !options?.animated ? 'crop' : undefined
    ) || undefined
  );
};
