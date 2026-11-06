import { IEventRelation, MatrixClient, Room } from 'matrix-js-sdk';
import { encryptFile } from '../../utils/matrix';
import { safeFile } from '../../utils/mimeTypes';
import { TUploadItem } from '../../state/room/roomInputDrafts';
import { VoiceMeta } from '../../plugins/voiceMessage';
import { getAudioMsgContent } from './msgContent';

/**
 * Uploads a recorded voice message and sends it right away (one tap, like Messages), encrypted in
 * encrypted rooms. Throws on failure so the caller can keep the recording.
 */
export const sendVoiceMessage = async (
  mx: MatrixClient,
  room: Room,
  file: File,
  voice: VoiceMeta,
  relatesTo?: IEventRelation
): Promise<void> => {
  const safe = safeFile(file);
  const metadata = { markedAsSpoiler: false, voice };
  const item: TUploadItem = room.hasEncryptionStateEvent()
    ? { ...(await encryptFile(safe)), metadata }
    : { file: safe, originalFile: safe, encInfo: undefined, metadata };
  const upload = await mx.uploadContent(item.file, {
    type: item.file.type,
    // an encrypted file must not reveal its name to the server
    includeFilename: !item.encInfo,
  });
  if (!upload.content_uri) throw new Error('Upload failed');
  const content = getAudioMsgContent(item, upload.content_uri);
  if (relatesTo && Object.keys(relatesTo).length > 0) content['m.relates_to'] = relatesTo;
  await mx.sendMessage(room.roomId, content as never);
};
