import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Icon,
  IconButton,
  Icons,
  Scroll,
  Spinner,
  Text,
  config,
} from 'folds';
import { Direction } from 'matrix-js-sdk';
import { useSetAtom } from 'jotai';
import FileSaver from 'file-saver';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { useRoom } from '../../../hooks/useRoom';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useRoomNavigate } from '../../../hooks/useRoomNavigate';
import { useCloseRoomSettings } from '../../../state/hooks/roomSettings';
import { imageViewerAtom } from '../../../state/imageViewer';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { bytesToSize } from '../../../utils/common';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import {
  MEDIA_KINDS,
  MediaEncryptedFile,
  MediaItem,
  MediaKind,
  mediaItemFromEvent,
  mediaOfKind,
  mergeMediaItems,
} from '../../../plugins/mediaOverview';
import * as css from './styles.css';

/** Messages read per request; a few pages are read up front, like iOS. */
const PAGE_SIZE = 100;
const FIRST_PAGES = 4;

const asEncInfo = (file: MediaEncryptedFile): EncryptedAttachmentInfo =>
  file as unknown as EncryptedAttachmentInfo;

/** A blob or http address for the media; encrypted media is downloaded and decrypted. */
const useMediaLoader = () => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  return useCallback(
    async (mxc: string, file: MediaEncryptedFile | undefined, mime: string | undefined, thumb?: number) => {
      if (file) {
        const url = mxcUrlToHttp(mx, file.url, useAuthentication);
        if (!url) throw new Error('Invalid media URL');
        const blob = await downloadEncryptedMedia(url, (buf) =>
          decryptFile(buf, mime ?? FALLBACK_MIMETYPE, asEncInfo(file))
        );
        return { src: URL.createObjectURL(blob), blob };
      }
      const url = thumb
        ? mxcUrlToHttp(mx, mxc, useAuthentication, thumb, thumb, 'scale')
        : mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!url) throw new Error('Invalid media URL');
      return { src: url, blob: undefined };
    },
    [mx, useAuthentication]
  );
};

/** True once the element has been on screen; encrypted pictures are only fetched then. */
const useSeen = (): [React.RefObject<HTMLButtonElement>, boolean] => {
  const ref = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setSeen(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
};

type TileProps = {
  item: MediaItem;
  onOpen: (item: MediaItem) => void;
};

function MediaTile({ item, onOpen }: TileProps) {
  const load = useMediaLoader();
  const [ref, seen] = useSeen();
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  // Videos only have a picture when the sender attached a preview.
  const picture =
    item.kind === 'pictures'
      ? { mxc: item.thumbMxc ?? item.mxc, file: item.thumbMxc ? item.thumbFile : item.file }
      : item.thumbMxc && { mxc: item.thumbMxc, file: item.thumbFile };
  const pictureMime = item.kind === 'pictures' && !item.thumbMxc ? item.mimeType : item.thumbMimeType;

  useEffect(() => {
    if (!seen || !picture) return undefined;
    let alive = true;
    let objectUrl: string | undefined;
    load(picture.mxc, picture.file, pictureMime ?? 'image/jpeg', 320)
      .then(({ src: url, blob }) => {
        if (blob) objectUrl = url;
        if (alive) setSrc(url);
        else if (objectUrl) URL.revokeObjectURL(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // the picture is fixed for an item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, item.eventId, load]);

  return (
    <button
      ref={ref}
      type="button"
      className={css.Tile}
      onClick={() => onOpen(item)}
      title={item.name}
      aria-label={item.kind === 'videos' ? `Video ${item.name}` : item.name}
    >
      {src && !failed ? (
        <img className={css.TileImage} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Box className={css.TileFallback} alignItems="Center" justifyContent="Center">
          {picture && seen && !failed ? (
            <Spinner variant="Secondary" size="200" />
          ) : (
            <Icon src={item.kind === 'videos' ? Icons.Vlc : Icons.Photo} />
          )}
        </Box>
      )}
      {item.kind === 'videos' && (
        <span className={css.PlayBadge}>
          <Icon size="100" src={Icons.Play} filled />
        </span>
      )}
    </button>
  );
}

type FileRowProps = {
  item: MediaItem;
  onJump: (item: MediaItem) => void;
};

function FileRow({ item, onJump }: FileRowProps) {
  const load = useMediaLoader();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const handleDownload = async () => {
    setBusy(true);
    setError(false);
    try {
      const { src, blob } = await load(item.mxc, item.file, item.mimeType);
      FileSaver.saveAs(blob ?? (await downloadMedia(src)), item.name);
      if (blob) setTimeout(() => URL.revokeObjectURL(src), 60_000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const meta = [
    typeof item.size === 'number' ? bytesToSize(item.size) : undefined,
    item.ts ? new Date(item.ts).toLocaleDateString() : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box className={css.FileRow} alignItems="Center" gap="300">
      <Icon src={Icons.File} />
      <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
        <Text size="T300" truncate>
          {item.name}
        </Text>
        <Text size="T200" priority="300" truncate>
          {error ? 'Download failed' : meta}
        </Text>
      </Box>
      <IconButton
        size="300"
        radii="300"
        variant="SurfaceVariant"
        onClick={handleDownload}
        disabled={busy}
        aria-label="Download"
      >
        {busy ? <Spinner size="100" variant="Secondary" /> : <Icon size="100" src={Icons.Download} />}
      </IconButton>
      <IconButton
        size="300"
        radii="300"
        variant="SurfaceVariant"
        onClick={() => onJump(item)}
        aria-label="Show in chat"
      >
        <Icon size="100" src={Icons.ArrowGoRight} />
      </IconButton>
    </Box>
  );
}

type MediaFilesProps = {
  requestClose: () => void;
};

/** "Media & Files" of the room settings (#189): pictures, videos and files, newest first. */
export function MediaFiles({ requestClose }: MediaFilesProps) {
  const room = useRoom();
  const mx = useMatrixClient();
  const load = useMediaLoader();
  const setViewerImage = useSetAtom(imageViewerAtom);
  const { navigateRoom } = useRoomNavigate();
  const closeSettings = useCloseRoomSettings();

  const [kind, setKind] = useState<MediaKind>('pictures');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const token = useRef<string | null>(null);
  const busy = useRef(false);

  const loadPages = useCallback(
    async (pages: number) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setError(false);
      try {
        const mapper = mx.getEventMapper();
        for (let page = 0; page < pages; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const res = await mx.createMessagesRequest(room.roomId, token.current, PAGE_SIZE, Direction.Backward);
          const events = res.chunk.map(mapper);
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(events.map((ev) => mx.decryptEventIfNeeded(ev).catch(() => undefined)));
          const found = events
            .map((ev) =>
              mediaItemFromEvent({
                eventId: ev.getId(),
                type: ev.getType(),
                sender: ev.getSender(),
                ts: ev.getTs(),
                content: ev.getContent(),
                redacted: ev.isRedacted(),
                relType: ev.getRelation()?.rel_type,
              })
            )
            .filter((item): item is MediaItem => !!item);
          setItems((current) => mergeMediaItems(current, found));
          token.current = res.end ?? null;
          if (!res.end || res.chunk.length === 0) {
            setDone(true);
            break;
          }
        }
      } catch {
        setError(true);
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [mx, room.roomId]
  );

  useEffect(() => {
    loadPages(FIRST_PAGES);
  }, [loadPages]);

  const jumpTo = (item: MediaItem) => {
    closeSettings();
    navigateRoom(room.roomId, item.eventId);
  };

  const openItem = async (item: MediaItem) => {
    if (item.kind !== 'pictures') {
      jumpTo(item);
      return;
    }
    try {
      const { src } = await load(item.mxc, item.file, item.mimeType);
      setViewerImage({ src, alt: item.name });
    } catch {
      jumpTo(item);
    }
  };

  const shown = mediaOfKind(items, kind);
  const empty = {
    pictures: 'No pictures found yet.',
    videos: 'No videos found yet.',
    files: 'No files found yet.',
  }[kind];

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Media & Files
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface" aria-label="Close">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="400">
              <Box gap="200" wrap="Wrap" role="tablist">
                {MEDIA_KINDS.map((entry) => (
                  <Chip
                    key={entry.kind}
                    role="tab"
                    aria-selected={kind === entry.kind}
                    variant={kind === entry.kind ? 'Primary' : 'SurfaceVariant'}
                    radii="Pill"
                    size="400"
                    outlined={kind !== entry.kind}
                    onClick={() => setKind(entry.kind)}
                  >
                    <Text size="B300">{`${entry.label} (${mediaOfKind(items, entry.kind).length})`}</Text>
                  </Chip>
                ))}
              </Box>
              {kind === 'files' ? (
                <Box direction="Column" gap="100">
                  {shown.map((item) => (
                    <FileRow key={item.eventId} item={item} onJump={jumpTo} />
                  ))}
                </Box>
              ) : (
                <div className={css.Grid}>
                  {shown.map((item) => (
                    <MediaTile key={item.eventId} item={item} onOpen={openItem} />
                  ))}
                </div>
              )}
              <Box direction="Column" alignItems="Center" gap="200" style={{ padding: config.space.S300 }}>
                {shown.length === 0 && !loading && (
                  <Text size="T300" priority="300">
                    {empty}
                  </Text>
                )}
                {error && (
                  <Text size="T300" style={{ color: 'var(--tc-critical-normal, #e5484d)' }}>
                    Could not load older messages.
                  </Text>
                )}
                {loading && <Spinner variant="Secondary" />}
                {!loading && !done && (
                  <Button size="300" variant="Secondary" fill="Soft" radii="300" onClick={() => loadPages(FIRST_PAGES)}>
                    <Text size="B300">Load older</Text>
                  </Button>
                )}
                {done && shown.length > 0 && (
                  <Text size="T200" priority="300">
                    That is everything in this room.
                  </Text>
                )}
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
