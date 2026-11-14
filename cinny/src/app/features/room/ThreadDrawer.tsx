import React, {
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  config,
  toRem,
} from 'folds';
import { MatrixEvent, Room, RoomEvent } from 'matrix-js-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts as LinkifyOpts } from 'linkifyjs';
import { useSetAtom } from 'jotai';
import { Page, PageHeader } from '../../components/page';
import { PageColumnDivider } from '../../components/page/style.css';
import {
  CompactLayout,
  MessageBase,
  RedactedContent,
  Time,
  Username,
} from '../../components/message';
import { RenderMessageContent } from '../../components/RenderMessageContent';
import { ScreenSize, useScreenSizeContext } from '../../hooks/useScreenSize';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMentionClickHandler } from '../../hooks/useMentionClickHandler';
import { useSpoilerClickHandler } from '../../hooks/useSpoilerClickHandler';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { openThreadAtom } from '../../state/openThread';
import { getEditedEvent, getMemberDisplayName } from '../../utils/room';
import { getMxIdLocalPart } from '../../utils/matrix';
import { buildThreadReply, mergeThreadReplies } from '../../plugins/threadEvents';
import {
  factoryRenderLinkifyWithMention,
  getReactCustomHtmlParser,
  LINKIFY_OPTS,
  makeMentionCustomProps,
  renderMatrixMention,
} from '../../plugins/react-custom-html-parser';
import { GetContentCallback } from '../../../types/matrix/room';

type ThreadDrawerProps = {
  room: Room;
  rootId: string;
};

const toLike = (evt: MatrixEvent) => ({
  id: evt.getId(),
  ts: evt.getTs(),
  threadRootId: evt.threadRootId,
  evt,
});

/** The thread of one message next to the room: the root, its replies and a field to answer (#188). */
export function ThreadDrawer({ room, rootId }: ThreadDrawerProps) {
  const mx = useMatrixClient();
  const screenSize = useScreenSizeContext();
  const closeThread = useSetAtom(openThreadAtom);
  const useAuthentication = useMediaAuthentication();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const mentionClickHandler = useMentionClickHandler(room.roomId);
  const spoilerClickHandler = useSpoilerClickHandler();

  const [version, setVersion] = useState(0);
  const [fromServer, setFromServer] = useState<MatrixEvent[]>([]);
  const [rootFromServer, setRootFromServer] = useState<MatrixEvent | undefined>();
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // new events of the room (replies, edits, decrypted messages) refresh the view
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    room.on(RoomEvent.Timeline, refresh);
    room.on(RoomEvent.Redaction, refresh);
    mx.on('Event.decrypted' as any, refresh);
    return () => {
      room.off(RoomEvent.Timeline, refresh);
      room.off(RoomEvent.Redaction, refresh);
      mx.off('Event.decrypted' as any, refresh);
    };
  }, [mx, room]);

  // older replies that are not in the timeline yet: ask the server for the thread's relations
  useEffect(() => {
    let cancelled = false;
    setFromServer([]);
    setRootFromServer(undefined);
    setLoadError(false);
    (async () => {
      try {
        const events: MatrixEvent[] = [];
        let from: string | undefined;
        let original: MatrixEvent | null | undefined;
        for (let page = 0; page < 10; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const res = await mx.relations(room.roomId, rootId, 'm.thread', null, {
            from,
            dir: 'f' as any,
            limit: 50,
          } as any);
          original = original ?? res.originalEvent;
          events.push(...res.events);
          if (!res.nextBatch) break;
          from = res.nextBatch;
        }
        await Promise.all(
          [...events, ...(original ? [original] : [])].map((e) =>
            mx.decryptEventIfNeeded(e).catch(() => undefined)
          )
        );
        if (cancelled) return;
        setFromServer(events);
        setRootFromServer(original ?? undefined);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mx, room.roomId, rootId]);

  const timelineSet = room.getUnfilteredTimelineSet();
  const rootEvent = room.findEventById(rootId) ?? rootFromServer;
  const replies = useMemo(() => {
    const local = timelineSet
      .getLiveTimeline()
      .getEvents()
      .filter((e) => e.threadRootId === rootId)
      .map(toLike);
    return mergeThreadReplies(rootId, local, fromServer.map(toLike)).map((l) => l.evt);
    // `version` changes whenever the room timeline does, so new replies show up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineSet, rootId, fromServer, version]);

  const lastId = replies.length > 0 ? replies[replies.length - 1].getId() : rootId;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const linkifyOpts = useMemo<LinkifyOpts>(
    () => ({
      ...LINKIFY_OPTS,
      render: factoryRenderLinkifyWithMention((href) =>
        renderMatrixMention(mx, room.roomId, href, makeMentionCustomProps(mentionClickHandler))
      ),
    }),
    [mx, room, mentionClickHandler]
  );
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, room.roomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
        handleMentionClick: mentionClickHandler,
      }),
    [mx, room, linkifyOpts, spoilerClickHandler, mentionClickHandler, useAuthentication]
  );

  const handleSend = useCallback(async () => {
    const content = buildThreadReply(rootId, lastId, draft);
    if (!content || sending) return;
    setSending(true);
    setSendError(false);
    try {
      await mx.sendMessage(room.roomId, content as any);
      setDraft('');
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  }, [mx, room.roomId, rootId, lastId, draft, sending]);

  const handleKeyDown = (evt: KeyboardEvent<HTMLInputElement>) => {
    if (evt.key === 'Enter' && !evt.shiftKey && !evt.nativeEvent.isComposing) {
      evt.preventDefault();
      handleSend();
    }
  };

  const renderEvent = (mEvent: MatrixEvent) => {
    const id = mEvent.getId() ?? '';
    const senderId = mEvent.getSender() ?? '';
    const name = getMemberDisplayName(room, senderId) ?? getMxIdLocalPart(senderId) ?? senderId;
    const edited = getEditedEvent(id, mEvent, timelineSet);
    const getContent = (() =>
      edited?.getContent()['m.new_content'] ?? mEvent.getContent()) as GetContentCallback;
    const encrypted = mEvent.isEncrypted() && mEvent.getContent().msgtype === undefined;
    let body: ReactNode;
    if (mEvent.isRedacted()) {
      body = <RedactedContent reason={mEvent.getUnsigned().redacted_because?.content.reason} />;
    } else if (encrypted) {
      body = (
        <Text size="T300" priority="300">
          Message could not be decrypted yet
        </Text>
      );
    } else {
      body = (
        <RenderMessageContent
          displayName={name}
          msgType={mEvent.getContent().msgtype ?? ''}
          ts={mEvent.getTs()}
          edited={!!edited}
          getContent={getContent}
          mediaAutoLoad={mediaAutoLoad}
          urlPreview={false}
          htmlReactParserOptions={htmlReactParserOptions}
          linkifyOpts={linkifyOpts}
        />
      );
    }
    return (
      <MessageBase key={id} data-thread-message-id={id}>
        <CompactLayout
          before={
            <Time
              compact
              ts={mEvent.getTs()}
              hour24Clock={hour24Clock}
              dateFormatString={dateFormatString}
            />
          }
        >
          <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
            <Username>
              <Text as="span" size="T300" truncate>
                <b>{name}</b>
              </Text>
            </Username>
            {body}
          </Box>
        </CompactLayout>
      </MessageBase>
    );
  };

  return (
    <Page
      className={screenSize === ScreenSize.Desktop ? PageColumnDivider : undefined}
      style={{
        width: screenSize === ScreenSize.Desktop ? toRem(400) : '100%',
        flexShrink: 0,
        flexGrow: 0,
      }}
      aria-label="Thread"
    >
      <PageHeader>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Box grow="Yes">
            <Text size="H5" truncate>
              Thread
            </Text>
          </Box>
          <TooltipProvider
            position="Bottom"
            align="End"
            offset={4}
            tooltip={
              <Tooltip>
                <Text>Close</Text>
              </Tooltip>
            }
          >
            {(triggerRef) => (
              <IconButton
                ref={triggerRef}
                variant="Surface"
                aria-label="Close thread"
                onClick={() => closeThread(undefined)}
              >
                <Icon src={Icons.Cross} />
              </IconButton>
            )}
          </TooltipProvider>
        </Box>
      </PageHeader>
      <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
        <Box grow="Yes" style={{ minHeight: 0 }}>
          <Scroll ref={scrollRef} variant="Background" size="300" hideTrack visibility="Hover">
            <Box direction="Column" gap="200" style={{ padding: config.space.S300 }}>
              {rootEvent ? (
                renderEvent(rootEvent)
              ) : (
                <Text size="T300" priority="300">
                  {loadError
                    ? 'The first message of this thread could not be loaded.'
                    : 'Loading thread...'}
                </Text>
              )}
              <Text size="L400" priority="300">
                {replies.length === 1 ? '1 reply' : `${replies.length} replies`}
              </Text>
              {replies.map(renderEvent)}
              {loadError && replies.length === 0 && (
                <Text size="T300" priority="300">
                  Older replies could not be loaded.
                </Text>
              )}
            </Box>
          </Scroll>
        </Box>
        <Box direction="Column" gap="100" style={{ padding: config.space.S300 }}>
          {sendError && (
            <Text size="T200" style={{ color: 'var(--mx-critical, #d9534f)' }}>
              The reply was not sent. Try again.
            </Text>
          )}
          <Input
            variant="Background"
            size="400"
            radii="400"
            placeholder="Reply in thread"
            aria-label="Reply in thread"
            value={draft}
            disabled={sending}
            onChange={(evt) => setDraft(evt.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
        </Box>
      </Box>
    </Page>
  );
}
