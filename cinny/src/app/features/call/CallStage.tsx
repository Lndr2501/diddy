import React, { MouseEvent, useEffect, useRef, useState } from 'react';
import { Avatar, Icon, IconButton, Icons, Text, toRem } from 'folds';
import { CallEmbed } from '../../plugins/call';
import {
  EMPTY_STAGE,
  enableCallStage,
  readCallStage,
  StageModel,
  StagePerson,
  StageShare,
  stageSignature,
} from '../../plugins/call/callStage';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoom } from '../../hooks/useRoom';
import { getMemberAvatarMxc } from '../../utils/room';
import { mxcUrlToHttp } from '../../utils/matrix';
import { UserAvatar } from '../../components/user-avatar';
import { openCallUserMenu } from '../../plugins/callFrameMenu';
import { initialsFromName } from './CallMemberCard';
import * as css from './styles.css';

/** Who is on the call, read from Element Call and kept up to date (cheap: only on change). */
function useCallStage(callEmbed: CallEmbed): StageModel {
  const [model, setModel] = useState<StageModel>(EMPTY_STAGE);
  const signature = useRef('');

  useEffect(() => {
    const doc = callEmbed.document;
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = readCallStage(callEmbed.document);
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
    // or stops sending changes nothing in the DOM, so a slow poll catches that
    const observer = new MutationObserver(schedule);
    if (doc?.body) {
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-muted', 'data-id', 'aria-label'],
      });
    }
    const poll = window.setInterval(schedule, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [callEmbed]);

  return model;
}

function StageVideo({ stream, fit }: { stream: MediaStream; fit: 'cover' | 'contain' }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => undefined);
  }, [stream]);
  // the sound plays in the call itself: this element only shows the picture
  return <video ref={ref} className={css.StageVideo} data-fit={fit} autoPlay playsInline muted />;
}

const ICON_MIC = 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3';
const ICON_SCREEN = 'M3 5h18v11H3z M8 20h8 M12 16v4';

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

function PersonTile({ person, focused, small, onSelect }: TileProps & { person: StagePerson }) {
  const mx = useMatrixClient();
  const room = useRoom();
  const useAuthentication = useMediaAuthentication();
  const avatarMxc = getMemberAvatarMxc(room, person.userId);
  const avatarUrl = avatarMxc
    ? mxcUrlToHttp(mx, avatarMxc, useAuthentication, 192, 192, 'crop') ?? undefined
    : undefined;
  const handleContextMenu = (evt: MouseEvent) => {
    evt.preventDefault();
    openCallUserMenu(person.userId, evt.clientX, evt.clientY);
  };
  const camera = person.video?.getVideoTracks()[0]?.getSettings?.();
  const ratio = camera?.width && camera?.height ? camera.width / camera.height : 16 / 9;
  return (
    <button
      style={{ ['--stage-ratio' as string]: ratio.toFixed(4) }}
      type="button"
      className={css.StageTile}
      data-speaking={person.speaking || undefined}
      data-focused={focused || undefined}
      data-small={small || undefined}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      aria-label={person.name}
    >
      {person.video ? (
        <StageVideo stream={person.video} fit="cover" />
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

function ShareTile({ share, focused, small, onSelect }: TileProps & { share: StageShare }) {
  const tileRef = useRef<HTMLDivElement>(null);
  const label = `${share.name}’s Stream`;
  // the shared screen's own shape: the large view takes exactly that, without black bars
  const settings = share.video?.getVideoTracks()[0]?.getSettings?.();
  const ratio =
    settings?.width && settings?.height ? settings.width / settings.height : 16 / 9;
  const handleContextMenu = (evt: MouseEvent) => {
    evt.preventDefault();
    openCallUserMenu(share.userId, evt.clientX, evt.clientY);
  };
  return (
    <div
      ref={tileRef}
      className={css.StageTile}
      data-kind="stream"
      data-focused={focused || undefined}
      data-small={small || undefined}
      style={{ ['--stage-ratio' as string]: ratio.toFixed(4) }}
    >
      <button
        type="button"
        className={css.StageTileHit}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        aria-label={focused ? `Stop watching ${label} large` : `Watch ${label}`}
      />
      {share.video ? (
        <StageVideo stream={share.video} fit="contain" />
      ) : (
        <Text size="T300" priority="300" className={css.StageWaiting}>
          Waiting for the stream…
        </Text>
      )}
      <span className={css.StageLive}>LIVE</span>
      {focused && (
        <IconButton
          className={css.StageCorner}
          variant="Surface"
          fill="None"
          size="300"
          radii="300"
          aria-label="Full screen"
          title="Full screen"
          onClick={() => tileRef.current?.requestFullscreen?.().catch(() => undefined)}
        >
          <Icon size="100" src={Icons.External} />
        </IconButton>
      )}
      <span className={css.StageTag}>
        <TagIcon d={ICON_SCREEN} />
        <span className={css.StageTagText}>{label}</span>
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

  useEffect(() => enableCallStage(callEmbed.iframe), [callEmbed]);

  const items: StageItem[] = [
    ...model.people.map((person) => ({ key: `p:${person.userId}`, kind: 'person' as const, person })),
    ...model.shares.map((share) => ({ key: `s:${share.id}`, kind: 'share' as const, share })),
  ];
  const focused = items.find((item) => item.key === focusKey);

  useEffect(() => {
    if (focusKey && !focused) setFocusKey(undefined);
  }, [focusKey, focused]);

  useEffect(() => {
    if (!focusKey) return undefined;
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') setFocusKey(undefined);
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
        focused={isFocused}
        small={small}
        onSelect={onSelect}
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
