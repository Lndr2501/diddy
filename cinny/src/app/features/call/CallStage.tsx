import React, {
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Avatar, Text, toRem } from 'folds';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import {
  EMPTY_STAGE,
  enableCallStage,
  markSpeaking,
  readCallStage,
  StageModel,
  StagePerson,
  StageShare,
  stageMutationMatters,
  stageSignature,
} from '../../plugins/call/callStage';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoom } from '../../hooks/useRoom';
import { getMemberAvatarMxc } from '../../utils/room';
import { mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { openCallUserMenu } from '../../plugins/callFrameMenu';
import { useLocalSpeaking } from '../../plugins/call/localSpeaking';
import { initialsFromName } from './CallMemberCard';
import { useAgentTalking } from '../../state/agentVoice';
import { useShareVolume } from './useShareVolume';
import {
  isAnyFullscreen,
  STREAM_CONTROLS_ATTR,
  useElementFullscreen,
  useIdle,
  useStreamZoom,
} from './useStreamView';
import { isZoomed, ZOOM_MAX, zoomPercent, zoomTransform } from '../../plugins/call/streamZoom';
import { cachedLiveKitRooms } from '../../plugins/call/callMute';
import {
  applyShareWatch,
  installShareWatchStyle,
  isOwnShare,
  localIdentities,
  releaseShareWatch,
  shareWatch,
} from '../../plugins/call/shareWatch';
import * as css from './styles.css';

/** Who is on the call, read from Element Call and kept up to date (cheap: only on change). */
function useCallStage(callEmbed: CallEmbed): StageModel {
  const mx = useMatrixClient();
  const localSpeaking = useLocalSpeaking();
  const [model, setModel] = useState<StageModel>(EMPTY_STAGE);
  const signature = useRef('');
  // your own mute state is Diddy's call control (#107), not Element Call's tile
  const { microphone } = useCallControlState(callEmbed.control);
  const userId = mx.getUserId() ?? undefined;

  useEffect(() => {
    const doc = callEmbed.document;
    const local = userId ? { userId, microphone } : undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = readCallStage(callEmbed.document, local);
      const sig = stageSignature(next);
      if (sig === signature.current) return;
      signature.current = sig;
      setModel(next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    // tiles come and go, speaking / mute change classes and attributes; a camera that starts
    // or stops sending and somebody else's LiveKit mute change nothing in the DOM, so a slow
    // poll catches that
    // Element Call animates its tiles through inline styles, which re-read the whole stage every
    // frame; only a style change of a <video> matters (hidden camera, #145).
    const observer = new MutationObserver((records) => {
      if (records.some(stageMutationMatters)) schedule();
    });
    if (doc?.body) {
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-muted', 'data-id', 'aria-label', 'style'],
      });
    }
    const poll = window.setInterval(schedule, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [callEmbed, userId, microphone]);

  // your own ring comes from Diddy's microphone level (#76)
  return useMemo(
    () => markSpeaking(model, mx.getUserId() ?? undefined, localSpeaking),
    [model, mx, localSpeaking]
  );
}

/**
 * One <video> element per stream for the whole call. Switching between the grid and the large
 * view moves that element into the new tile instead of destroying it and creating another one:
 * tearing down and rebuilding Chromium's media player for the call's streams on every click
 * crashed the renderer when someone switched quickly between streams.
 */
const videoPool = new Map<string, HTMLVideoElement>();

const pooledVideo = (stream: MediaStream): HTMLVideoElement => {
  let video = videoPool.get(stream.id);
  if (video && video.srcObject !== stream) {
    video.srcObject = stream;
  }
  if (!video) {
    video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    // the sound plays in the call itself: this element only shows the picture
    video.muted = true;
    video.srcObject = stream;
    videoPool.set(stream.id, video);
  }
  return video;
};

/** Let go of the elements of streams that ended (all of them when the stage closes). */
const releaseVideos = (keep: Set<string>) => {
  videoPool.forEach((element, id) => {
    if (keep.has(id)) return;
    const video = element;
    video.pause();
    video.srcObject = null;
    video.remove();
    videoPool.delete(id);
  });
};

function StageVideo({
  stream,
  fit,
  mirror,
  transform,
}: {
  stream: MediaStream;
  fit: 'cover' | 'contain';
  /** zoom of a stream (streamZoom.ts) */
  transform?: string;
  /** your own camera is shown as in a mirror, like in Element and Discord */
  mirror?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const video = pooledVideo(stream);
    // appendChild moves the element if another tile showed it until now
    if (video.parentElement !== host) host.appendChild(video);
    // a media element is paused while it is out of the document
    video.play().catch(() => undefined);
  }, [stream]);
  return (
    <div
      ref={hostRef}
      className={css.StageVideo}
      data-fit={fit}
      data-mirror={mirror || undefined}
      style={transform ? { transform } : undefined}
    />
  );
}

const ICON_MIC =
  'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3';
const ICON_SCREEN = 'M3 5h18v11H3z M8 20h8 M12 16v4';
/** eye with a slash: stop watching a stream (#206) */
const ICON_STOP_WATCH =
  'M3 3l18 18 M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2 M6.5 7.6A16.6 16.6 0 0 0 3 12s4 6 9 6a8.7 8.7 0 0 0 4-.9 M9.9 9.9a3 3 0 0 0 4.2 4.2';
const ICON_SPEAKER =
  'M4 9.5h3.5L12 6v12l-4.5-3.5H4z M15.5 9.5a3.5 3.5 0 0 1 0 5 M18 7a7 7 0 0 1 0 10';

function TagIcon({ d, muted }: { d: string; muted?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={css.StageTagIcon}
      data-muted={muted || undefined}
      aria-hidden="true"
    >
      <path d={muted ? `${d} M4 4l16 16` : d} />
    </svg>
  );
}

type TileProps = {
  focused?: boolean;
  small?: boolean;
  onSelect: () => void;
};

/**
 * A person's tile on the call stage: camera or picture, speaking ring, name tag. Also drawn by
 * the profile editor's call preview (#105).
 */
export function PersonTileView({
  person,
  avatarMxc,
  agent,
  focused,
  small,
  onSelect,
  onContextMenu,
}: TileProps & {
  person: StagePerson;
  avatarMxc?: string;
  agent?: boolean;
  onContextMenu?: (evt: MouseEvent) => void;
}) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 192, 192, 'crop') ?? undefined
    : undefined;
  const handleContextMenu = onContextMenu;
  const camera = person.video?.getVideoTracks()[0]?.getSettings?.();
  const ratio = camera?.width && camera?.height ? camera.width / camera.height : 16 / 9;
  return (
    <button
      style={{ ['--stage-ratio' as string]: ratio.toFixed(4) }}
      type="button"
      className={css.StageTile}
      data-speaking={person.speaking || undefined}
      data-agent={agent || undefined}
      data-focused={focused || undefined}
      data-small={small || undefined}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      aria-label={agent ? `${person.name}, redet mit Agent` : person.name}
    >
      {agent && (
        <span className={css.StageAgentBadge} role="status">
          <TagIcon d={ICON_MIC} />
          Redet mit Agent
        </span>
      )}
      {person.video ? (
        <StageVideo stream={person.video} fit="cover" mirror={person.userId === mx.getUserId()} />
      ) : (
        <Avatar className={css.StageAvatar} radii="Pill">
          <UserAvatar
            surface="call"
            userId={person.userId}
            src={avatarUrl}
            alt={person.name}
            renderFallback={() => (
              <Text as="span" size="H3">
                {initialsFromName(person.name)}
              </Text>
            )}
          />
        </Avatar>
      )}
      <span className={css.StageTag}>
        <TagIcon d={ICON_MIC} muted={person.muted} />
        <span className={css.StageTagText}>{person.name}</span>
      </span>
    </button>
  );
}

export function PersonTile({
  person,
  focused,
  small,
  onSelect,
}: TileProps & { person: StagePerson }) {
  const mx = useMatrixClient();
  const agent = useAgentTalking(person.userId, mx.getUserId() ?? undefined);
  const room = useRoom();
  const handleContextMenu = (evt: MouseEvent) => {
    evt.preventDefault();
    openCallUserMenu(person.userId, evt.clientX, evt.clientY);
  };
  return (
    <PersonTileView
      person={person}
      avatarMxc={getMemberAvatarMxc(room, person.userId)}
      agent={agent}
      focused={focused}
      small={small}
      onSelect={onSelect}
      onContextMenu={handleContextMenu}
    />
  );
}

const ICON_ZOOM_IN =
  'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.2 15.2L20 20 M10.5 7.5v6 M7.5 10.5h6';
const ICON_ZOOM_OUT = 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.2 15.2L20 20 M7.5 10.5h6';
const ICON_FULLSCREEN = 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5';
const ICON_FULLSCREEN_EXIT = 'M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5';

function ToolIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className={css.StageToolIcon} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

type ShareTileProps = TileProps & {
  share: StageShare;
  doc: Document | undefined;
  /** false: somebody else's share you have not opened, shown as a card (#206) */
  watching?: boolean;
  onWatch?: () => void;
  onStopWatching?: () => void;
};

export function ShareTile({
  share,
  doc,
  focused,
  small,
  onSelect,
  watching = true,
  onWatch,
  onStopWatching,
}: ShareTileProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggleFullscreen } = useElementFullscreen(tileRef);
  const large = !!focused || fullscreen;
  const { zoom, dragging, zoomIn, zoomOut, resetZoom, wasDrag } = useStreamZoom(tileRef, large);
  const zoomed = isZoomed(zoom);
  const idle = useIdle(tileRef, fullscreen);
  // turned down to nothing for you (right-click > Stream Volume): shown on the name tag
  const volume = useShareVolume(doc, share.id, share.userId);
  const mutedForMe = !!volume?.hasAudio && volume.volume === 0;
  const label = `${share.name}’s Stream`;
  // the shared screen's own shape: the large view takes exactly that, without black bars
  const settings = share.video?.getVideoTracks()[0]?.getSettings?.();
  const ratio = settings?.width && settings?.height ? settings.width / settings.height : 16 / 9;
  const handleContextMenu = (evt: MouseEvent) => {
    evt.preventDefault();
    openCallUserMenu(share.userId, evt.clientX, evt.clientY, share.id);
  };
  // a click ends a drag of the zoomed picture, or would close the large view: in full screen
  // and while zoomed in it does nothing (zoom back out or leave full screen first)
  const handleClick = () => {
    if (!watching) {
      onWatch?.();
      return;
    }
    if (wasDrag()) return;
    if (fullscreen || zoomed) return;
    onSelect();
  };

  // keys while the stream fills the screen: + and - zoom, 0 resets, F leaves full screen
  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
      if (evt.key === '+' || evt.key === '=') zoomIn();
      else if (evt.key === '-') zoomOut();
      else if (evt.key === '0') resetZoom();
      else if (evt.key === 'f' || evt.key === 'F') toggleFullscreen();
      else return;
      evt.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, zoomIn, zoomOut, resetZoom, toggleFullscreen]);

  let hitLabel = watching ? `Show ${label} large` : `Watch ${label}`;
  if (fullscreen) hitLabel = label;
  else if (focused) hitLabel = `Stop watching ${label} large`;

  return (
    <div
      ref={tileRef}
      className={css.StageTile}
      data-kind="stream"
      data-focused={focused || undefined}
      data-small={small || undefined}
      data-zoomed={zoomed || undefined}
      data-dragging={dragging || undefined}
      data-fullscreen={fullscreen || undefined}
      data-idle={idle || undefined}
      style={{ ['--stage-ratio' as string]: ratio.toFixed(4) }}
    >
      <button
        type="button"
        className={css.StageTileHit}
        onClick={handleClick}
        onDoubleClick={fullscreen ? toggleFullscreen : undefined}
        onContextMenu={handleContextMenu}
        aria-label={hitLabel}
      />
      {!watching && (
        <span className={css.StageShareCard} aria-hidden="true">
          <svg viewBox="0 0 24 24" className={css.StageShareCardIcon}>
            <path d={ICON_SCREEN} />
          </svg>
          <span className={css.StageShareCardText}>{share.name} is sharing their screen</span>
          <span className={css.StageWatchPill}>Watch</span>
        </span>
      )}
      {watching && share.video && (
        <StageVideo stream={share.video} fit="contain" transform={zoomTransform(zoom)} />
      )}
      {watching && !share.video && (
        <Text size="T300" priority="300" className={css.StageWaiting}>
          Waiting for the stream…
        </Text>
      )}
      <span className={css.StageLive}>LIVE</span>
      {watching && !large && onStopWatching && (
        <button
          type="button"
          className={css.StageStopWatch}
          onClick={onStopWatching}
          aria-label={`Stop watching ${label}`}
          title="Stop watching"
        >
          Stop watching
        </button>
      )}
      {watching && large && (
        <div
          className={css.StageToolbar}
          {...{ [STREAM_CONTROLS_ATTR]: true }}
          role="toolbar"
          aria-label="Stream view"
        >
          <button
            type="button"
            className={css.StageToolButton}
            onClick={zoomOut}
            disabled={!zoomed}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ToolIcon d={ICON_ZOOM_OUT} />
          </button>
          <button
            type="button"
            className={css.StageToolZoom}
            onClick={resetZoom}
            disabled={!zoomed}
            aria-label={zoomed ? `Zoom ${zoomPercent(zoom)} %, reset` : 'Not zoomed'}
            title={zoomed ? 'Reset zoom' : 'Scroll or pinch to zoom'}
          >
            {zoomPercent(zoom)}%
          </button>
          <button
            type="button"
            className={css.StageToolButton}
            onClick={zoomIn}
            disabled={zoom.scale >= ZOOM_MAX}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ToolIcon d={ICON_ZOOM_IN} />
          </button>
          <button
            type="button"
            className={css.StageToolButton}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
          >
            <ToolIcon d={fullscreen ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN} />
          </button>
          {onStopWatching && !fullscreen && (
            <button
              type="button"
              className={css.StageToolButton}
              onClick={onStopWatching}
              aria-label={`Stop watching ${label}`}
              title="Stop watching"
            >
              <ToolIcon d={ICON_STOP_WATCH} />
            </button>
          )}
        </div>
      )}
      <span className={css.StageTag}>
        <TagIcon d={ICON_SCREEN} />
        <span className={css.StageTagText}>{label}</span>
        {mutedForMe && (
          <span
            role="img"
            aria-label="Muted for you"
            title="Muted for you"
            style={{ display: 'flex' }}
          >
            <TagIcon d={ICON_SPEAKER} muted />
          </span>
        )}
      </span>
    </div>
  );
}

type StageItem =
  | { key: string; kind: 'person'; person: StagePerson }
  | { key: string; kind: 'share'; share: StageShare };

/** Columns for `count` equal tiles: 1, 2, 3 or 4 wide. */
const gridColumns = (count: number): number => {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
};

/**
 * The call as Discord shows it: one tile per person and one per screen share, all the same size.
 * A click on a tile puts it large in front, the others move into a strip below; a click on the
 * large one (or Escape) goes back to the grid.
 */
export function CallStage({ callEmbed }: { callEmbed: CallEmbed }) {
  const model = useCallStage(callEmbed);
  const [focusKey, setFocusKey] = useState<string>();
  const mx = useMatrixClient();
  const myUserId = mx.getUserId() ?? undefined;
  const watched = useSyncExternalStore(shareWatch.subscribe, shareWatch.getSnapshot);

  useEffect(() => enableCallStage(callEmbed.iframe), [callEmbed]);

  // somebody else's share is received only after Watch (#206): keep Element Call in step with
  // the choices, also for sound tracks that arrive after their tile
  const shareIds = model.shares.map((share) => share.id).join('|');
  useEffect(() => {
    const apply = () => {
      const doc = callEmbed.document;
      const rooms = cachedLiveKitRooms(doc);
      const local = localIdentities(rooms);
      shareWatch.update(shareIds ? shareIds.split('|') : []);
      installShareWatchStyle(doc);
      applyShareWatch(
        doc,
        rooms,
        (id) => isOwnShare(id, local, myUserId) || shareWatch.isWatched(id)
      );
    };
    apply();
    const timer = window.setInterval(apply, 1000);
    return () => window.clearInterval(timer);
  }, [callEmbed, shareIds, watched, myUserId]);
  useEffect(
    () => () => {
      const doc = callEmbed.document;
      releaseShareWatch(doc, cachedLiveKitRooms(doc));
      shareWatch.clear();
    },
    [callEmbed]
  );
  const shareWatching = (share: StageShare): boolean => {
    if (watched.has(share.id)) return true;
    const rooms = cachedLiveKitRooms(callEmbed.document);
    return isOwnShare(share.id, localIdentities(rooms), myUserId);
  };

  // free the video elements of streams that ended, and all of them when the stage goes away
  useEffect(() => {
    const live = new Set<string>();
    model.people.forEach((p) => p.video && live.add(p.video.id));
    model.shares.forEach((s) => s.video && live.add(s.video.id));
    releaseVideos(live);
  }, [model]);
  useEffect(() => () => releaseVideos(new Set()), []);

  const items: StageItem[] = [
    ...model.people.map((person) => ({
      key: `p:${person.userId}`,
      kind: 'person' as const,
      person,
    })),
    ...model.shares.map((share) => ({ key: `s:${share.id}`, kind: 'share' as const, share })),
  ];
  const focused = items.find((item) => item.key === focusKey);

  useEffect(() => {
    if (focusKey && !focused) setFocusKey(undefined);
  }, [focusKey, focused]);

  useEffect(() => {
    if (!focusKey) return undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      // in full screen Escape only leaves full screen (useElementFullscreen)
      if (evt.key === 'Escape' && !isAnyFullscreen()) setFocusKey(undefined);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusKey]);

  const renderItem = (item: StageItem, small?: boolean) => {
    const isFocused = item.key === focusKey;
    const onSelect = () => setFocusKey(isFocused ? undefined : item.key);
    return item.kind === 'person' ? (
      <PersonTile
        key={item.key}
        person={item.person}
        focused={isFocused}
        small={small}
        onSelect={onSelect}
      />
    ) : (
      <ShareTile
        key={item.key}
        share={item.share}
        doc={callEmbed.document}
        focused={isFocused}
        small={small}
        onSelect={onSelect}
        watching={shareWatching(item.share)}
        onWatch={() => shareWatch.watch(item.share.id)}
        onStopWatching={
          watched.has(item.share.id)
            ? () => {
                shareWatch.stop(item.share.id);
                if (isFocused) setFocusKey(undefined);
              }
            : undefined
        }
      />
    );
  };

  if (items.length === 0) return null;

  if (focused) {
    const others = items.filter((item) => item.key !== focused.key);
    return (
      <div className={css.StageRoot}>
        <div className={css.StageFocus}>{renderItem(focused)}</div>
        {others.length > 0 && (
          <div className={css.StageStrip}>{others.map((item) => renderItem(item, true))}</div>
        )}
      </div>
    );
  }

  const columns = gridColumns(items.length);
  return (
    <div className={css.StageRoot}>
      <div
        className={css.StageGrid}
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${Math.ceil(items.length / columns)}, minmax(0, 1fr))`,
          maxWidth: columns === 1 ? toRem(1100) : undefined,
        }}
      >
        {items.map((item) => renderItem(item))}
      </div>
    </div>
  );
}
