import { MatrixClient } from 'matrix-js-sdk';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { safeMxc } from './sanitize';
import { checkNameplateFile, checkNameplateVideoDuration } from './nameplate';

export const MAX_DIDDY_MEDIA_BYTES = 8 * 1024 * 1024;

/** The upload limit: ours, or the server's when it is lower. */
const uploadLimit = async (mx: MatrixClient): Promise<number> => {
  let maxBytes = MAX_DIDDY_MEDIA_BYTES;
  try {
    const config = await mx.getMediaConfig();
    const serverMax = config['m.upload.size'];
    if (typeof serverMax === 'number' && serverMax > 0) maxBytes = Math.min(maxBytes, serverMax);
  } catch {
    // unknown server limit: keep the default
  }
  return maxBytes;
};

/** Uploads a file to the Matrix media repo and returns its mxc:// url. */
export const uploadDiddyMedia = async (mx: MatrixClient, file: File): Promise<string> => {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new Error('Please choose a PNG, JPG, GIF or WebP image.');
  }
  const maxBytes = await uploadLimit(mx);
  if (file.size > maxBytes) {
    throw new Error(`File too large (max ${Math.max(1, Math.floor(maxBytes / (1024 * 1024)))} MB)`);
  }
  const res = await mx.uploadContent(file, { type: file.type });
  return res.content_uri;
};

const POSTER_MAX_WIDTH = 960;
const VIDEO_PROBE_TIMEOUT_MS = 15000;

type VideoProbe = { duration: number; poster: Blob };

/**
 * Plays the video locally (before anything is uploaded): checks its length and returns its first
 * frame as a still picture. Fails when this browser cannot decode the file.
 */
const probeVideo = (file: File): Promise<VideoProbe> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let done = false;
    let timer = 0;
    const finish = (error?: string, result?: VideoProbe) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      if (result) resolve(result);
      else reject(new Error(error ?? 'This video cannot be played here.'));
    };
    timer = window.setTimeout(
      () => finish('Reading the video took too long.'),
      VIDEO_PROBE_TIMEOUT_MS
    );
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onerror = () => finish();
    video.onloadeddata = () => {
      const lengthError = checkNameplateVideoDuration(video.duration);
      if (lengthError) {
        finish(lengthError);
        return;
      }
      video.currentTime = Math.min(0.05, video.duration / 2);
    };
    video.onseeked = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        finish();
        return;
      }
      const scale = Math.min(1, POSTER_MAX_WIDTH / w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) finish(undefined, { duration: video.duration, poster: blob });
        else finish();
      }, 'image/png');
    };
    video.src = url;
  });

/**
 * Uploads a nameplate background (#78). A picture becomes `imageMxc`; a short WebM / MP4 loop
 * becomes `videoMxc` and its first frame `imageMxc`, the still picture shown where nameplates do
 * not move. Type, size and length are checked before anything is uploaded.
 */
export const uploadNameplateMedia = async (
  mx: MatrixClient,
  file: File
): Promise<{ imageMxc: string; videoMxc?: string }> => {
  const check = checkNameplateFile(file, await uploadLimit(mx));
  if (!check.ok) throw new Error(check.error);
  if (check.kind === 'image') {
    const res = await mx.uploadContent(file, { type: file.type });
    return { imageMxc: res.content_uri };
  }
  const { poster } = await probeVideo(file);
  const posterRes = await mx.uploadContent(poster, { type: 'image/png', name: 'nameplate.png' });
  const videoRes = await mx.uploadContent(file, { type: file.type });
  return { imageMxc: posterRes.content_uri, videoMxc: videoRes.content_uri };
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
