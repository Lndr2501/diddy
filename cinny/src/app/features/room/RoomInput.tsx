import React, {
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue, useSetAtom, useStore } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import { EventType, IContent, IEventRelation, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { ReactEditor } from 'slate-react';
import { Transforms, Editor } from 'slate';
import {
  Box,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Scroll,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { RESET } from 'jotai/utils';

import { StickerEventContent } from 'matrix-js-sdk/lib/types';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  CustomEditor,
  Toolbar,
  toMatrixCustomHTML,
  toPlainText,
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  getAutocompleteQuery,
  getPrevWordRange,
  resetEditor,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  createEmoticonElement,
  moveCursor,
  resetEditorHistory,
  customHtmlEqualsPlainText,
  trimCustomHtml,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
} from '../../components/editor';
import { EmojiBoard, EmojiBoardTab } from '../../components/emoji-board';
import { UseStateProvider } from '../../components/UseStateProvider';
import {
  TUploadContent,
  encryptFile,
  getImageInfo,
  getMxIdLocalPart,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { useTypingStatusUpdater } from '../../hooks/useTypingStatusUpdater';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useFilePasteHandler } from '../../hooks/useFilePasteHandler';
import { useFileDropZone } from '../../hooks/useFileDrop';
import {
  IReplyDraft,
  TUploadItem,
  TUploadMetadata,
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
} from '../../state/room/roomInputDrafts';
import { UploadCardRenderer } from '../../components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
} from '../../components/upload-board';
import {
  Upload,
  UploadStatus,
  UploadSuccess,
  createUploadFamilyObserverAtom,
} from '../../state/upload';
import { getImageUrlBlob, loadImageElement } from '../../utils/dom';
import { safeFile } from '../../utils/mimeTypes';
import { fulfilledPromiseSettledResult } from '../../utils/common';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
} from './msgContent';
import { getMemberDisplayName, getMentionContent } from '../../utils/room';
import { replyPreviewText } from '../../utils/replyPreview';
import * as css from './RoomInput.css';
import { CommandAutocomplete } from './CommandAutocomplete';
import { BotCommandAutocomplete } from './BotCommandAutocomplete';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '../../hooks/useCommands';
import { mobileOrTablet } from '../../utils/user-agent';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
import { ReplyLayout, ThreadIndicator } from '../../components/message';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import colorMXID from '../../../util/colorMXID';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useComposingCheck } from '../../hooks/useComposingCheck';
import { useDebounce } from '../../hooks/useDebounce';
import { VoiceRecorderButton } from './VoiceRecorderButton';
import { VoiceRecording } from '../../hooks/useVoiceRecorder';
import { sendVoiceMessage } from './sendVoiceMessage';
import { useTranslation } from 'react-i18next';
import { PollDialog } from './PollDialog';
import { stopPropagation } from '../../utils/keyboard';
import { pushToastAtom } from '../../state/toasts';
import { ScheduledMessagesBar, ScheduledRow } from './send-later/ScheduledMessagesBar';
import { SendLaterDialog, routeExplanation } from './send-later/SendLaterDialog';
import { useScheduleMessage } from './send-later/useSendLater';
import { formatSendAt } from './send-later/sendLaterLogic';
import { knownMaxDelay } from './send-later/sendLaterService';

const getReplyContent = (replyDraft: IReplyDraft | undefined): IEventRelation => {
  if (!replyDraft) return {};

  const relatesTo: IEventRelation = {};

  relatesTo['m.in_reply_to'] = {
    event_id: replyDraft.eventId,
  };

  if (replyDraft.relation?.rel_type === RelationType.Thread) {
    relatesTo.event_id = replyDraft.relation.event_id;
    relatesTo.rel_type = RelationType.Thread;
    relatesTo.is_falling_back = false;
  }
  return relatesTo;
};
interface ReplyEventContent {
  'm.relates_to'?: IEventRelation;
}

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement>;
  roomId: string;
  room: Room;
}
export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const { t } = useTranslation();
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [enterForNewline] = useSetting(settingsAtom, 'enterForNewline');
    const [isMarkdown] = useSetting(settingsAtom, 'isMarkdown');
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
    const direct = useIsDirectRoom();
    const commands = useCommands(mx, room);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    // Written on every typing pause, read only to restore: subscribing re-rendered the whole input
    // after each save.
    const setMsgDraft = useSetAtom(roomIdToMsgDraftAtomFamily(roomId));
    const store = useStore();
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(roomId));
    const replyUserID = replyDraft?.userId;

    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const creatorsTag = useRoomCreatorsTag();
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const replyPowerTag = replyUserID ? getMemberPowerTag(replyUserID) : undefined;
    const replyPowerColor = replyPowerTag?.color
      ? accessibleTagColors.get(replyPowerTag.color)
      : undefined;
    const replyUsernameColor =
      legacyUsernameColor || direct ? colorMXID(replyUserID ?? '') : replyPowerColor;

    const [pollOpen, setPollOpen] = useState(false);
    const [uploadBoard, setUploadBoard] = useState(true);
    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>();
    // the send button only lights up when there is something to send
    const [hasText, setHasText] = useState(false);

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);

    const [toolbar, setToolbar] = useSetting(settingsAtom, 'editorToolbar');
    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

    const addFiles = useCallback(
      async (files: File[], extraMetadata?: Partial<TUploadMetadata>) => {
        setUploadBoard(true);
        const safeFiles = files.map(safeFile);
        const fileItems: TUploadItem[] = [];

        if (room.hasEncryptionStateEvent()) {
          const encryptFiles = fulfilledPromiseSettledResult(
            await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
          );
          encryptFiles.forEach((ef) =>
            fileItems.push({
              ...ef,
              metadata: {
                markedAsSpoiler: false,
                ...extraMetadata,
              },
            })
          );
        } else {
          safeFiles.forEach((f) =>
            fileItems.push({
              file: f,
              originalFile: f,
              encInfo: undefined,
              metadata: {
                markedAsSpoiler: false,
                ...extraMetadata,
              },
            })
          );
        }
        setSelectedFiles({
          type: 'PUT',
          item: fileItems,
        });
      },
      [setSelectedFiles, room]
    );
    const handleFiles = useCallback((files: File[]) => addFiles(files), [addFiles]);
    const handleVoiceRecorded = useCallback(
      async (recording: VoiceRecording) => {
        const voice = { durationMs: recording.durationMs, waveform: recording.waveform };
        try {
          await sendVoiceMessage(
            mx,
            room,
            recording.file,
            voice,
            replyDraft ? getReplyContent(replyDraft) : undefined
          );
          setReplyDraft(undefined);
        } catch {
          // nothing is lost: the recording goes to the upload board and can be sent from there
          await addFiles([recording.file], { voice });
        }
      },
      [mx, room, replyDraft, setReplyDraft, addFiles]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hideStickerBtn, setHideStickerBtn] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    useElementSizeObserver(
      useCallback(() => fileDropContainerRef.current, [fileDropContainerRef]),
      useCallback((width) => setHideStickerBtn(width < 500), [])
    );

    useEffect(() => {
      // if the editor is empty and there is a draft, restore it
      const msgDraft = store.get(roomIdToMsgDraftAtomFamily(roomId));
      if (isEmptyEditor(editor) && msgDraft && msgDraft.length > 0) {
        try {
          Transforms.insertFragment(editor, msgDraft);
        } catch {
          // a stale or invalid stored draft must never break the room
          setMsgDraft(RESET);
        }
      }
    }, [editor, roomId, store, setMsgDraft]);

    // Room of the latest render: a draft save that was scheduled for another room is dropped.
    const currentRoomIdRef = useRef(roomId);
    currentRoomIdRef.current = roomId;

    // On unmount, if the editor is not empty, save the draft. Otherwise, clear the draft.
    useEffect(
      () => () => {
        try {
          if (!isEmptyEditor(editor)) {
            const parsedDraft = JSON.parse(JSON.stringify(editor.children));
            setMsgDraft(parsedDraft);
          } else {
            setMsgDraft(RESET);
          }
        } catch {
          // e.g. localStorage full: losing a draft is better than crashing
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [roomId, editor, setMsgDraft]
    );

    // Save draft after the editor changes
    const handleAutomaticDraftSave = useDebounce(
      () => {
        if (currentRoomIdRef.current !== roomId) return;
        try {
          if (!isEmptyEditor(editor)) {
            const parsedDraft = JSON.parse(JSON.stringify(editor.children));
            setMsgDraft(parsedDraft);
          } else {
            setMsgDraft(RESET);
          }
        } catch {
          // storage full or similar
        }
      },
      { wait: 400 }
    );

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, metadata },
        });
      },
      [setSelectedFiles]
    );

    const handleRemoveUpload = useCallback(
      (upload: TUploadContent | TUploadContent[]) => {
        const uploads = Array.isArray(upload) ? upload : [upload];
        setSelectedFiles({
          type: 'DELETE',
          item: selectedFiles.filter((f) => uploads.find((u) => u === f.file)),
        });
        uploads.forEach((u) => roomUploadAtomFamily.remove(u));
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleCancelUpload = (uploads: Upload[]) => {
      uploads.forEach((upload) => {
        if (upload.status === UploadStatus.Loading) {
          mx.cancelUpload(upload.promise);
        }
      });
      handleRemoveUpload(uploads.map((upload) => upload.file));
    };

    const handleSendUpload = async (uploads: UploadSuccess[]) => {
      const plaintext = toPlainText(editor.children, isMarkdown).trim();
      const contentsPromises = uploads.map(async (upload) => {
        const fileItem = selectedFiles.find((f) => f.file === upload.file);
        if (!fileItem) throw new Error('Broken upload');

        if (fileItem.file.type.startsWith('image')) {
          return getImageMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('video')) {
          return getVideoMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('audio')) {
          return getAudioMsgContent(fileItem, upload.mxc);
        }
        return getFileMsgContent(fileItem, upload.mxc);
      });
      handleCancelUpload(uploads);
      const contents = fulfilledPromiseSettledResult(await Promise.allSettled(contentsPromises));

      if (contents.length > 0) {
        const replyContent = plaintext.length === 0 ? getReplyContent(replyDraft) : undefined;
        if (replyContent) contents[0]['m.relates_to'] = replyContent;
        setReplyDraft(undefined);
      }

      contents.forEach((content) => mx.sendMessage(roomId, content as any));
    };

    /**
     * The message the composer holds: its content, a command that runs instead (/myroomnick
     * and the like), or nothing.
     */
    const composeMessage = useCallback(():
      | { kind: 'message'; content: IContent }
      | { kind: 'command'; run: () => void }
      | { kind: 'empty' } => {
      const commandName = getBeginCommand(editor);
      let plainText = toPlainText(editor.children, isMarkdown).trim();
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          allowTextFormatting: true,
          allowBlockMarkdown: isMarkdown,
          allowInlineMarkdown: isMarkdown,
        })
      );
      let msgType = MsgType.Text;

      if (commandName) {
        plainText = trimCommand(commandName, plainText);
        customHtml = trimCommand(commandName, customHtml);
      }
      if (commandName === Command.Me) {
        msgType = MsgType.Emote;
      } else if (commandName === Command.Notice) {
        msgType = MsgType.Notice;
      } else if (commandName === Command.Shrug) {
        plainText = `${SHRUG} ${plainText}`;
        customHtml = `${SHRUG} ${customHtml}`;
      } else if (commandName === Command.TableFlip) {
        plainText = `${TABLEFLIP} ${plainText}`;
        customHtml = `${TABLEFLIP} ${customHtml}`;
      } else if (commandName === Command.UnFlip) {
        plainText = `${UNFLIP} ${plainText}`;
        customHtml = `${UNFLIP} ${customHtml}`;
      } else if (commandName) {
        const commandContent = commands[commandName as Command];
        const text = plainText;
        return { kind: 'command', run: () => commandContent?.exe(text) };
      }

      if (plainText === '') return { kind: 'empty' };

      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent = {
        msgtype: msgType,
        body,
      };

      if (replyDraft && replyDraft.userId !== mx.getUserId()) {
        mentionData.users.add(replyDraft.userId);
      }

      const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
      content['m.mentions'] = mMentions;

      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = formattedBody;
      }
      if (replyDraft) content['m.relates_to'] = getReplyContent(replyDraft);
      return { kind: 'message', content };
    }, [mx, roomId, editor, replyDraft, isMarkdown, commands]);

    const clearComposer = useCallback(() => {
      resetEditor(editor);
      resetEditorHistory(editor);
      setReplyDraft(undefined);
      sendTypingStatus(false);
    }, [editor, setReplyDraft, sendTypingStatus]);

    const submit = useCallback(() => {
      uploadBoardHandlers.current?.handleSend();

      const message = composeMessage();
      if (message.kind === 'command') {
        message.run();
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return;
      }
      if (message.kind === 'empty') return;

      // A failed send stays in the timeline as "not sent" with retry (local echo).
      mx.sendMessage(roomId, message.content as never).catch(() => undefined);
      clearComposer();
    }, [mx, roomId, editor, sendTypingStatus, composeMessage, clearComposer]);

    // Send later: right-click (or long press) on the send button.
    const [sendMenuAnchor, setSendMenuAnchor] = useState<RectCords>();
    const [sendLaterOpen, setSendLaterOpen] = useState(false);
    const longPressRef = useRef<number>();
    const longPressedRef = useRef(false);
    const scheduleMessage = useScheduleMessage(room);
    const pushToast = useSetAtom(pushToastAtom);
    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const canSendLater = hasText && selectedFiles.length === 0;

    const openSendMenu = useCallback((target: HTMLElement) => {
      setSendMenuAnchor(target.getBoundingClientRect());
    }, []);

    const handleSendContextMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
      evt.preventDefault();
      openSendMenu(evt.currentTarget);
    };

    const handleSendPointerDown: PointerEventHandler<HTMLButtonElement> = (evt) => {
      longPressedRef.current = false;
      if (evt.pointerType !== 'touch') return;
      const target = evt.currentTarget;
      window.clearTimeout(longPressRef.current);
      longPressRef.current = window.setTimeout(() => {
        longPressedRef.current = true;
        openSendMenu(target);
      }, 500);
    };
    const cancelLongPress = () => window.clearTimeout(longPressRef.current);

    const handleSendClick = () => {
      if (longPressedRef.current) {
        longPressedRef.current = false;
        return;
      }
      submit();
    };

    const handleSchedule = async (sendAt: number, preferLocal: boolean) => {
      const message = composeMessage();
      if (message.kind !== 'message') {
        setSendLaterOpen(false);
        return;
      }
      const draft = JSON.parse(JSON.stringify(editor.children));
      const reply = replyDraft
        ? {
            eventId: replyDraft.eventId,
            userId: replyDraft.userId,
            body: replyDraft.body,
            relation: replyDraft.relation,
          }
        : undefined;
      const result = await scheduleMessage({
        content: message.content,
        sendAt,
        preferLocal,
        draft,
        reply,
      });
      setSendLaterOpen(false);
      clearComposer();
      if (result.reason === 'too-far-for-server' || result.reason === 'server-failed') {
        // the dialog promised the server, but it said no: say where the message waits now
        pushToast({
          key: `send-later-route-${sendAt}`,
          title: 'Scheduled on this device',
          body: `${formatSendAt(sendAt, Date.now(), hour24Clock)}: ${
            routeExplanation(
              { route: 'local', reason: result.reason, encryptedAhead: false },
              knownMaxDelay(mx)
            ).text
          }`,
          roomId,
          stamp: Date.now(),
        });
      }
    };

    // Edit a scheduled message: it goes back into the composer, the schedule is gone.
    const handleEditScheduled = useCallback(
      (row: ScheduledRow) => {
        const draft = row.local?.draft;
        const body = typeof row.content.body === 'string' ? row.content.body : '';
        if (isEmptyEditor(editor)) resetEditor(editor);
        else Transforms.select(editor, Editor.end(editor, []));
        try {
          if (Array.isArray(draft) && draft.length > 0) {
            Transforms.insertFragment(editor, draft);
          } else {
            Transforms.insertText(editor, body);
          }
        } catch {
          Transforms.insertText(editor, body);
        }
        const reply = row.local?.reply;
        if (reply && !replyDraft) {
          setReplyDraft({
            eventId: reply.eventId,
            userId: reply.userId,
            body: reply.body,
            relation: reply.relation as IEventRelation | undefined,
          });
        }
        setHasText(true);
        ReactEditor.focus(editor);
      },
      [editor, replyDraft, setReplyDraft]
    );

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) || (!enterForNewline && isKeyHotkey('enter', evt))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          submit();
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [submit, setReplyDraft, enterForNewline, autocompleteQuery, isComposing]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        if (!hideActivity) {
          sendTypingStatus(!isEmptyEditor(editor));
        }

        const prevWordRange = getPrevWordRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor, sendTypingStatus, hideActivity]
    );

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      ReactEditor.focus(editor);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    const handleStickerSelect = async (mxc: string, shortcode: string, label: string) => {
      const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!stickerUrl) return;

      const info = await getImageInfo(
        await loadImageElement(stickerUrl),
        await getImageUrlBlob(stickerUrl)
      );

      const content: StickerEventContent & ReplyEventContent = {
        body: label,
        url: mxc,
        info,
      };
      if (replyDraft) {
        content['m.relates_to'] = getReplyContent(replyDraft);
        setReplyDraft(undefined);
      }
      mx.sendEvent(roomId, EventType.Sticker, content).catch(() => undefined);
    };

    return (
      <div ref={ref} className={css.Composer}>
        {selectedFiles.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={uploadBoard}
                onToggle={() => setUploadBoard(!uploadBoard)}
                uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                onSend={handleSendUpload}
                imperativeHandlerRef={uploadBoardHandlers}
                onCancel={handleCancelUpload}
              />
            }
          >
            {uploadBoard && (
              <Scroll size="300" hideTrack visibility="Hover">
                <UploadBoardContent>
                  {Array.from(selectedFiles)
                    .reverse()
                    .map((fileItem, index) => (
                      <UploadCardRenderer
                        // eslint-disable-next-line react/no-array-index-key
                        key={index}
                        isEncrypted={!!fileItem.encInfo}
                        fileItem={fileItem}
                        setMetadata={handleFileMetadata}
                        onRemove={handleRemoveUpload}
                      />
                    ))}
                </UploadBoardContent>
              </Scroll>
            )}
          </UploadBoard>
        )}
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                <Icon size="600" src={Icons.File} />
                <Text size="H4" align="Center">
                  {t('composer.input.dropFilesIn', {
                    room: room?.name || t('composer.input.room'),
                  })}
                </Text>
                <Text align="Center">{t('composer.input.dragAndDropFiles')}</Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {pollOpen && <PollDialog room={room} onClose={() => setPollOpen(false)} />}
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.BotCommand && (
          <BotCommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <ScheduledMessagesBar roomId={roomId} onEdit={handleEditScheduled} />
        {sendLaterOpen && (
          <SendLaterDialog
            room={room}
            onCancel={() => setSendLaterOpen(false)}
            onSchedule={handleSchedule}
          />
        )}
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          placeholder={t('composer.input.sendAMessage')}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          onChange={() => {
            setHasText(!isEmptyEditor(editor));
            handleAutomaticDraftSave();
          }}
          top={
            replyDraft && (
              <div>
                <Box alignItems="Center" gap="300" className={css.ReplyChip}>
                  <IconButton
                    onClick={() => setReplyDraft(undefined)}
                    variant="SurfaceVariant"
                    fill="None"
                    size="300"
                    radii="Pill"
                  >
                    <Icon src={Icons.Cross} size="50" />
                  </IconButton>
                  <Box direction="Row" gap="200" alignItems="Center">
                    {replyDraft.relation?.rel_type === RelationType.Thread && <ThreadIndicator />}
                    <ReplyLayout
                      userColor={replyUsernameColor}
                      username={
                        <Text size="T300" truncate>
                          <b>
                            {getMemberDisplayName(room, replyDraft.userId) ??
                              getMxIdLocalPart(replyDraft.userId) ??
                              replyDraft.userId}
                          </b>
                        </Text>
                      }
                    >
                      <Text size="T300" truncate>
                        {replyPreviewText(replyDraft.body)}
                      </Text>
                    </ReplyLayout>
                  </Box>
                </Box>
              </div>
            )
          }
          before={
            <details style={{ position: 'relative', alignSelf: 'center' }}>
              <summary aria-label="Add attachment or poll" title="Add attachment or poll" style={{ cursor: 'pointer', listStyle: 'none' }}>
                <Icon src={Icons.PlusCircle} />
              </summary>
              <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 10, background: color.SurfaceVariant.Container, color: color.SurfaceVariant.OnContainer, padding: 8, borderRadius: 8, display: 'grid', minWidth: 150 }}>
                <button type="button" onClick={(e) => { pickFile('*'); e.currentTarget.closest('details')?.removeAttribute('open'); }}>Attach file</button>
                <button type="button" onClick={(e) => { setPollOpen(true); e.currentTarget.closest('details')?.removeAttribute('open'); }}>📊 Poll</button>
              </div>
            </details>
          }
          after={
            <>
              <VoiceRecorderButton onRecorded={handleVoiceRecorded} />
              <IconButton
                variant="SurfaceVariant"
                fill="None"
                className={css.ComposerIconButton}
                size="300"
                radii="Pill"
                onClick={() => setToolbar(!toolbar)}
                aria-label={t('composer.input.formatting')}
                title={t('composer.input.formatting')}
                aria-pressed={toolbar}
              >
                <Icon src={toolbar ? Icons.AlphabetUnderline : Icons.Alphabet} />
              </IconButton>
              <UseStateProvider initial={undefined}>
                {(emojiBoardTab: EmojiBoardTab | undefined, setEmojiBoardTab) => (
                  <PopOut
                    offset={16}
                    alignOffset={-44}
                    position="Top"
                    align="End"
                    anchor={
                      emojiBoardTab === undefined
                        ? undefined
                        : emojiBtnRef.current?.getBoundingClientRect() ?? undefined
                    }
                    content={
                      <EmojiBoard
                        tab={emojiBoardTab}
                        onTabChange={setEmojiBoardTab}
                        imagePackRooms={imagePackRooms}
                        returnFocusOnDeactivate={false}
                        onEmojiSelect={handleEmoticonSelect}
                        onCustomEmojiSelect={handleEmoticonSelect}
                        onStickerSelect={handleStickerSelect}
                        requestClose={() => {
                          setEmojiBoardTab((t) => {
                            if (t) {
                              if (!mobileOrTablet()) ReactEditor.focus(editor);
                              return undefined;
                            }
                            return t;
                          });
                        }}
                      />
                    }
                  >
                    {!hideStickerBtn && (
                      <IconButton
                        aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                        aria-label={t('composer.input.stickers')}
                        title={t('composer.input.stickers')}
                        onClick={() => setEmojiBoardTab(EmojiBoardTab.Sticker)}
                        variant="SurfaceVariant"
                        fill="None"
                        className={css.ComposerIconButton}
                        size="300"
                        radii="Pill"
                      >
                        <Icon
                          src={Icons.Sticker}
                          filled={emojiBoardTab === EmojiBoardTab.Sticker}
                        />
                      </IconButton>
                    )}
                    <IconButton
                      ref={emojiBtnRef}
                      aria-label={t('composer.input.emoji')}
                      title={t('composer.input.emoji')}
                      aria-pressed={
                        hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                      }
                      onClick={() => setEmojiBoardTab(EmojiBoardTab.Emoji)}
                      variant="SurfaceVariant"
                      fill="None"
                      className={css.ComposerIconButton}
                      size="300"
                      radii="Pill"
                    >
                      <Icon
                        src={Icons.Smile}
                        filled={
                          hideStickerBtn ? !!emojiBoardTab : emojiBoardTab === EmojiBoardTab.Emoji
                        }
                      />
                    </IconButton>
                  </PopOut>
                )}
              </UseStateProvider>
              <IconButton
                onClick={handleSendClick}
                onContextMenu={handleSendContextMenu}
                onPointerDown={handleSendPointerDown}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                variant="Primary"
                size="300"
                radii="Pill"
                className={css.SendButton}
                data-ready={hasText || selectedFiles.length > 0}
                aria-label={t('composer.input.sendMessage')}
                aria-haspopup="menu"
                title="Send (right-click: Send Later…)"
              >
                <Icon src={Icons.Send} />
              </IconButton>
              {sendMenuAnchor && (
                <PopOut
                  anchor={sendMenuAnchor}
                  position="Top"
                  align="End"
                  offset={8}
                  content={
                    <FocusTrap
                      focusTrapOptions={{
                        initialFocus: false,
                        returnFocusOnDeactivate: false,
                        onDeactivate: () => setSendMenuAnchor(undefined),
                        clickOutsideDeactivates: true,
                        isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                        isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                        escapeDeactivates: stopPropagation,
                      }}
                    >
                      <Menu style={{ padding: config.space.S100, maxWidth: toRem(260) }}>
                        <MenuItem
                          size="300"
                          radii="300"
                          disabled={!canSendLater}
                          after={<Icon size="100" src={Icons.RecentClock} />}
                          onClick={() => {
                            setSendMenuAnchor(undefined);
                            setSendLaterOpen(true);
                          }}
                        >
                          <Text style={{ flexGrow: 1 }} as="span" size="T300" truncate>
                            Send Later…
                          </Text>
                        </MenuItem>
                        {selectedFiles.length > 0 && (
                          <Text
                            size="T200"
                            priority="300"
                            style={{ padding: `${config.space.S100} ${config.space.S200}` }}
                          >
                            Attachments cannot be scheduled.
                          </Text>
                        )}
                      </Menu>
                    </FocusTrap>
                  }
                />
              )}
            </>
          }
          bottom={
            toolbar && (
              <div>
                <Toolbar />
              </div>
            )
          }
        />
      </div>
    );
  }
);
