import { MatrixClient } from 'matrix-js-sdk';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';

export const MAX_DIDDY_MEDIA_BYTES = 8 * 1024 * 1024;

/** Uploads a file to the Matrix media repo and returns its mxc:// url. */
export const uploadDiddyMedia = async (mx: MatrixClient, file: File): Promise<string> => {
  if (file.size > MAX_DIDDY_MEDIA_BYTES) throw new Error('File too large (max 8 MB)');
  const res = await mx.uploadContent(file, { type: file.type });
  return res.content_uri;
};

/** Converts an mxc:// url to an http(s) url (authenticated media aware). */
export const useMxcUrl = (
  mxc: string | undefined,
  size?: { w: number; h: number }
): string | undefined => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  if (!mxc) return undefined;
  return (
    mxcUrlToHttp(
      mx,
      mxc,
      useAuthentication,
      size?.w,
      size?.h,
      size ? 'crop' : undefined
    ) ?? undefined
  );
};
