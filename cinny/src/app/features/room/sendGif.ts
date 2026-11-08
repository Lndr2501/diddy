import { IEventRelation, MatrixClient, Room } from 'matrix-js-sdk';
import { encryptFile } from '../../utils/matrix';
import { TUploadItem } from '../../state/room/roomInputDrafts';
import {
  checkDownloadedGif,
  gifFileName,
  GifProviderId,
  GifResult,
  MAX_DOWNLOAD_BYTES,
  safeMediaUrl,
} from '../../plugins/gifSearch';
import { getImageMsgContent } from './msgContent';

/**
 * Downloads the chosen rendition from the provider's CDN. Only https URLs on that CDN are
 * fetched (also after redirects), without cookies or referrer, and only images up to a size limit
 * are accepted.
 */
export const downloadGif = async (provider: GifProviderId, gif: GifResult): Promise<File> => {
  const url = safeMediaUrl(provider, gif.sendUrl);
  if (!url) throw new Error('This GIF comes from an unexpected address.');
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (response.url && !safeMediaUrl(provider, response.url)) {
    throw new Error('This GIF comes from an unexpected address.');
  }
  if (!response.ok) throw new Error(`The GIF could not be downloaded (${response.status}).`);
  const announced = Number(response.headers.get('content-length') ?? 0);
  if (announced > MAX_DOWNLOAD_BYTES) throw new Error('This GIF is too large.');
  const blob = await response.blob();
  const type = (blob.type || response.headers.get('content-type') || gif.mimetype)
    .split(';')[0]
    .trim()
    .toLowerCase();
  const check = checkDownloadedGif(type, blob.size);
  if (!check.ok) throw new Error(`The GIF could not be used (${check.reason}).`);
  return new File([blob], gifFileName({ title: gif.title, mimetype: type }), { type });
};

/**
 * Sends a GIF from a search provider as a normal image message: the file is uploaded to the
 * homeserver (encrypted in encrypted rooms), so nobody else ever loads it from the provider.
 */
export const sendGif = async (
  mx: MatrixClient,
  room: Room,
  provider: GifProviderId,
  gif: GifResult,
  relatesTo?: IEventRelation
): Promise<void> => {
  const file = await downloadGif(provider, gif);
  const metadata = { markedAsSpoiler: false };
  const item: TUploadItem = room.hasEncryptionStateEvent()
    ? { ...(await encryptFile(file)), metadata }
    : { file, originalFile: file, encInfo: undefined, metadata };
  const upload = await mx.uploadContent(item.file, {
    type: item.file.type,
    // an encrypted file must not reveal its name to the server
    includeFilename: !item.encInfo,
  });
  if (!upload.content_uri) throw new Error('Upload failed');
  const content = await getImageMsgContent(mx, item, upload.content_uri);
  // body stays the file name (a different body would show up as a caption in other clients)
  // fall back to the provider's numbers if the image could not be measured
  content.info = {
    w: gif.w,
    h: gif.h,
    ...content.info,
    mimetype: file.type,
    size: file.size,
  };
  if (relatesTo && Object.keys(relatesTo).length > 0) content['m.relates_to'] = relatesTo;
  await mx.sendMessage(room.roomId, content as never);
};
