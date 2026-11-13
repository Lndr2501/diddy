import React, { KeyboardEvent, MouseEvent, useCallback, useEffect, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useOptionalRoom } from '../../hooks/useRoom';
import { mxcUrlToHttp } from '../../utils/matrix';
import {
  BotCard,
  CARD_ACTION_KEY,
  CardAction,
  Chart,
  ListItem,
  QueueItem,
  TrackState,
  formatCardTime,
  livePosition,
} from '../../plugins/botCard';
import * as css from './BotCard.css';

const STATE_LABEL: Record<TrackState, string> = {
  searching: 'Suche läuft',
  downloading: 'Lädt herunter',
  playing: 'Spielt jetzt',
  paused: 'Pausiert',
  stopped: 'Gestoppt',
  error: 'Fehler',
};

/**
 * Types a bot command into the chat as you (nothing is sent without a click or key press).
 * Outside of a room view (inbox notifications, search results) there is no chat to type into:
 * `enabled` is false and the card is shown without its buttons (#125).
 */
function useBotCommand(): { send: (command: string) => void; busy: boolean; enabled: boolean } {
  const mx = useMatrixClient();
  const room = useOptionalRoom();
  const [busy, setBusy] = useState(false);
  const send = useCallback(
    (command: string) => {
      if (busy || !room) return;
      setBusy(true);
      mx.sendMessage(room.roomId, {
        msgtype: 'm.text',
        body: command,
        [CARD_ACTION_KEY]: true,
      } as never)
        .catch(() => undefined)
        .finally(() => window.setTimeout(() => setBusy(false), 700));
    },
    [mx, room, busy]
  );
  return { send, busy, enabled: !!room };
}

function CardActions({ actions }: { actions: CardAction[] }) {
  const { send, busy, enabled } = useBotCommand();
  if (!enabled || actions.length === 0) return null;
  return (
    <div className={css.Actions}>
      {actions.map((a) => (
        <button
          key={a.send}
          type="button"
          className={css.ActionButton}
          disabled={busy}
          onClick={() => send(a.send)}
          title={a.send}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

type TrackCardData = Extract<BotCard, { kind: 'track' }>;

/**
 * Progress bar of a track card; clickable (seek) when the bot gave a seek command. `classic`: the old
 * layout with the volume between the times and a yellow bar while paused.
 */
function TrackProgress({ card, classic }: { card: TrackCardData; classic: boolean }) {
  const { send, busy, enabled } = useBotCommand();
  const [hover, setHover] = useState<number>();
  const now = useNow(card.state === 'playing' && card.duration !== undefined);
  const position = livePosition(card, now);
  const { duration } = card;
  const ratio = position !== undefined && duration ? Math.min(1, position / duration) : undefined;
  const seekable =
    enabled &&
    !!card.seek &&
    duration !== undefined &&
    position !== undefined &&
    (card.state === 'playing' || card.state === 'paused');

  const ratioAt = (evt: MouseEvent<HTMLElement>): number => {
    const rect = evt.currentTarget.getBoundingClientRect();
    return rect.width > 0 ? Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width)) : 0;
  };
  const seekTo = (evt: MouseEvent<HTMLElement>) => {
    if (!seekable || !card.seek || duration === undefined || busy) return;
    send(`${card.seek} ${formatCardTime(ratioAt(evt) * duration)}`);
  };
  const seekByKey = (evt: KeyboardEvent<HTMLElement>) => {
    if (!seekable || !card.seek || busy) return;
    if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') send(`${card.seek} -10`);
    else if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') send(`${card.seek} +10`);
    else return;
    evt.preventDefault();
  };

  if (ratio === undefined || position === undefined || duration === undefined) {
    return duration !== undefined ? (
      <div className={css.Times}>
        <span>Länge {formatCardTime(duration)}</span>
      </div>
    ) : null;
  }

  const bar = (
    <div className={css.Bar}>
      <div
        className={css.BarFill}
        data-paused={(classic && card.state === 'paused') || undefined}
        style={{ width: `${(ratio * 100).toFixed(1)}%` }}
      />
    </div>
  );
  const valueText = `${formatCardTime(position)} von ${formatCardTime(duration)}`;

  return (
    <div className={css.Progress}>
      {seekable ? (
        <div
          className={css.SeekArea}
          data-seekable
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={valueText}
          aria-label="Wiedergabe"
          onClick={seekTo}
          onKeyDown={seekByKey}
          onMouseMove={(evt) => setHover(ratioAt(evt))}
          onMouseLeave={() => setHover(undefined)}
        >
          {bar}
          {hover !== undefined && (
            <span className={css.SeekTip} style={{ left: `${(hover * 100).toFixed(1)}%` }}>
              {formatCardTime(hover * duration)}
            </span>
          )}
        </div>
      ) : (
        <div
          className={css.SeekArea}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={valueText}
          aria-label="Wiedergabe"
        >
          {bar}
        </div>
      )}
      <div className={css.Times}>
        <span>{formatCardTime(position)}</span>
        {classic && card.volume !== undefined && <span>🔊 {Math.round(card.volume)}</span>}
        <span>{formatCardTime(duration)}</span>
      </div>
    </div>
  );
}

function useCover(thumbnail: string | undefined, size: number): string | undefined {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  return thumbnail
    ? mxcUrlToHttp(mx, thumbnail, useAuthentication, size, size, 'crop') ?? undefined
    : undefined;
}

/** The classic track card (bots that send no `controls`): state chip, title, buttons from `actions`. */
function TrackCard({ card }: { card: TrackCardData }) {
  const busyState = card.state === 'searching' || card.state === 'downloading';
  const cover = useCover(card.thumbnail, 128);

  return (
    <div className={css.Card} data-bot-card="track">
      <div className={css.TrackRow}>
        <div className={css.Cover} aria-hidden>
          {cover ? <img className={css.CoverImg} src={cover} alt="" /> : '🎵'}
        </div>
        <div className={css.TrackText}>
          <span className={css.StateChip} data-state={card.state}>
            <span className={css.Dot} data-busy={busyState || undefined} />
            {STATE_LABEL[card.state]}
          </span>
          <p className={css.Title}>{card.title}</p>
          {card.artist && <span className={css.Artist}>{card.artist}</span>}
        </div>
      </div>
      <TrackProgress card={card} classic />
      {card.note && <span className={css.Hint}>{card.note}</span>}
      <CardActions actions={card.actions} />
    </div>
  );
}

// Small stroke icons the folds / Diddy icon set does not have (same 24 grid and stroke style)
function Glyph({ d, filled }: { d: string; filled?: boolean }) {
  return (
    <svg
      className={css.Glyph}
      viewBox="0 0 24 24"
      aria-hidden
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
const GLYPH = {
  prev: 'M18 6.5v11a.6.6 0 0 1-.95.5L9.5 12.5a.6.6 0 0 1 0-1L17.05 6a.6.6 0 0 1 .95.5zM6 6v12',
  skip: 'M6 6.5v11a.6.6 0 0 0 .95.5l7.55-5.5a.6.6 0 0 0 0-1L6.95 6a.6.6 0 0 0-.95.5zM18 6v12',
  play: 'M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.6-6.2a.8.8 0 0 0 0-1.4L9.2 5.1a.8.8 0 0 0-1.2.7z',
  pause: 'M7.5 5.5h2.5v13H7.5zM14 5.5h2.5v13H14z',
  volume:
    'M4 9.5h3l4-3.5v12l-4-3.5H4a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  more: 'M4 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M17 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  music: 'M9 18V5.5l11-2V16M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
};

/** Closes a popover on a click outside of `ref` or on Escape. */
function useDismiss(open: boolean, close: () => void): React.RefObject<HTMLDivElement> {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (evt: PointerEvent) => {
      if (ref.current && !ref.current.contains(evt.target as Node)) close();
    };
    const onKey = (evt: globalThis.KeyboardEvent) => {
      if (evt.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** Volume button: opens a slider (0..max); releasing it sends `<command> N`. */
function VolumeControl({
  command,
  volume,
  max,
  send,
  busy,
}: {
  command: string;
  volume?: number;
  max: number;
  send: (c: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => Math.round(Math.min(volume ?? 0, max)));
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  useEffect(() => {
    if (!open) setValue(Math.round(Math.min(volume ?? 0, max)));
  }, [volume, max, open]);
  const commit = () => {
    if (volume === undefined || Math.round(volume) !== value) send(`${command} ${value}`);
  };
  return (
    <div className={css.PopAnchor} ref={ref}>
      <button
        type="button"
        className={css.PlayerButton}
        aria-label={volume !== undefined ? `Volume ${Math.round(volume)}%` : 'Volume'}
        aria-expanded={open}
        title={command}
        onClick={() => setOpen((o) => !o)}
      >
        <Glyph d={GLYPH.volume} />
        {volume !== undefined && <span>{Math.round(volume)}%</span>}
      </button>
      {open && (
        <div className={css.Popover} data-bot-popover="volume">
          <input
            className={css.VolumeSlider}
            type="range"
            min={0}
            max={max}
            step={1}
            value={value}
            disabled={busy}
            aria-label="Volume"
            onChange={(evt) => setValue(Number(evt.currentTarget.value))}
            onPointerUp={commit}
            onKeyUp={(evt) => {
              if (evt.key.startsWith('Arrow') || evt.key === 'Home' || evt.key === 'End') commit();
            }}
          />
          <span className={css.VolumeValue}>{value}%</span>
        </div>
      )}
    </div>
  );
}

/** "⋯" menu with the extra commands of the player (`more`). */
function MoreMenu({
  items,
  send,
  busy,
}: {
  items: CardAction[];
  send: (c: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  return (
    <div className={css.PopAnchor} ref={ref}>
      <button
        type="button"
        className={css.PlayerButton}
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Glyph d={GLYPH.more} filled />
      </button>
      {open && (
        <div className={css.Popover} role="menu" data-bot-popover="more">
          {items.map((a) => (
            <button
              key={a.send}
              type="button"
              role="menuitem"
              className={css.MenuItem}
              disabled={busy}
              title={a.send}
              onClick={() => {
                send(a.send);
                setOpen(false);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PLAYER_HEADER: Record<TrackState, string> = {
  searching: 'Searching',
  downloading: 'Loading',
  playing: 'Now playing',
  paused: 'Paused',
  stopped: 'Stopped',
  error: 'Error',
};

/** Player layout of a track card (the bot sent `controls`); `actions` are ignored here. */
function PlayerCard({
  card,
  controls,
}: {
  card: TrackCardData;
  controls: NonNullable<TrackCardData['controls']>;
}) {
  const { send, busy, enabled } = useBotCommand();
  const cover = useCover(card.thumbnail, 112);
  const playing = card.state === 'playing';
  const header = `${PLAYER_HEADER[card.state]}${
    card.room && (playing || card.state === 'paused') ? ` in ${card.room}` : ''
  }`;
  const sub = [card.artist, card.requestedBy && `requested by ${card.requestedBy}`]
    .filter(Boolean)
    .join(' · ');
  const more = card.more ?? [];
  const hasButtons =
    enabled &&
    (controls.prev || controls.toggle || controls.skip || controls.volume || more.length > 0);

  return (
    <div className={css.Card} data-bot-card="track" data-player>
      <div className={css.TrackRow}>
        <div className={css.PlayerCover} data-art={!cover || undefined} aria-hidden>
          {cover ? <img className={css.CoverImg} src={cover} alt="" /> : <Glyph d={GLYPH.music} />}
        </div>
        <div className={css.TrackText}>
          <span className={css.Eyebrow}>{header}</span>
          <p className={css.Title}>{card.title}</p>
          {sub && <span className={css.Artist}>{sub}</span>}
        </div>
      </div>
      <TrackProgress card={card} classic={false} />
      {card.note && <span className={css.Hint}>{card.note}</span>}
      {hasButtons && (
        <div className={css.PlayerButtons}>
          {controls.prev && (
            <button
              type="button"
              className={css.PlayerButton}
              aria-label="Previous"
              title={controls.prev}
              disabled={busy}
              onClick={() => controls.prev && send(controls.prev)}
            >
              <Glyph d={GLYPH.prev} />
            </button>
          )}
          {controls.toggle && (
            <button
              type="button"
              className={css.PlayerButton}
              data-primary
              title={controls.toggle}
              disabled={busy}
              onClick={() => controls.toggle && send(controls.toggle)}
            >
              <Glyph d={playing ? GLYPH.pause : GLYPH.play} filled />
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          {controls.skip && (
            <button
              type="button"
              className={css.PlayerButton}
              title={controls.skip}
              disabled={busy}
              onClick={() => controls.skip && send(controls.skip)}
            >
              <Glyph d={GLYPH.skip} />
              Skip
            </button>
          )}
          {controls.volume && (
            <VolumeControl
              command={controls.volume}
              volume={card.volume}
              max={card.volumeMax ?? 100}
              send={send}
              busy={busy}
            />
          )}
          {more.length > 0 && <MoreMenu items={more} send={send} busy={busy} />}
        </div>
      )}
      {card.upNext && card.upNext.length > 0 && (
        <div className={css.HelpGroup}>
          <p className={css.Eyebrow}>Up next</p>
          <ol className={css.List}>
            {card.upNext.map((item, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i} className={css.QueueItemRow}>
                <span className={css.UpNextIndex}>{i + 1}</span>
                <span className={css.QueueName}>
                  {item.title}
                  {item.artist ? ` · ${item.artist}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function QueueRow({ item, index }: { item: QueueItem; index: number }) {
  return (
    <li className={css.QueueItemRow}>
      <span className={css.QueueIndex}>{index}.</span>
      <span className={css.QueueName}>
        {item.title}
        {item.artist ? ` · ${item.artist}` : ''}
      </span>
      {item.duration !== undefined && (
        <span className={css.QueueTime}>{formatCardTime(item.duration)}</span>
      )}
    </li>
  );
}

function QueueCard({ card }: { card: Extract<BotCard, { kind: 'queue' }> }) {
  const more = card.total - card.items.length;
  return (
    <div className={css.Card} data-bot-card="queue">
      <p className={css.SectionTitle}>Warteschlange · {card.total}</p>
      {card.now && (
        <div className={css.TrackText}>
          <span className={css.StateChip} data-state="playing">
            <span className={css.Dot} />
            Spielt jetzt
          </span>
          <p className={css.Title}>{card.now.title}</p>
          {card.now.artist && <span className={css.Artist}>{card.now.artist}</span>}
        </div>
      )}
      {card.items.length > 0 ? (
        <ol className={css.List}>
          {card.items.map((item, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <QueueRow key={i} item={item} index={i + 1} />
          ))}
        </ol>
      ) : (
        <span className={css.Hint}>Die Warteschlange ist leer.</span>
      )}
      {more > 0 && <span className={css.Hint}>… und {more} weitere</span>}
      <CardActions actions={card.actions} />
    </div>
  );
}

function HelpCard({ card }: { card: Extract<BotCard, { kind: 'help' }> }) {
  return (
    <div className={css.Card} data-bot-card="help">
      {card.groups.map((group) => (
        <div key={group.title} className={css.HelpGroup}>
          <p className={css.SectionTitle}>{group.title}</p>
          {group.items.map((item) => (
            <div key={item.usage} className={css.HelpRow}>
              <code className={css.Code}>{item.usage}</code>
              <span>{item.desc}</span>
            </div>
          ))}
        </div>
      ))}
      {card.note && <span className={css.Hint}>{card.note}</span>}
    </div>
  );
}

function ListCard({ card }: { card: Extract<BotCard, { kind: 'list' }> }) {
  const more = card.total - card.items.length;
  return (
    <div className={css.Card} data-bot-card="list">
      <p className={css.SectionTitle}>
        {card.title} · {card.total}
      </p>
      {card.items.length > 0 ? (
        <ol className={css.List}>
          {card.items.map((item: ListItem, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <QueueRow key={i} item={{ ...item, artist: item.subtitle }} index={i + 1} />
          ))}
        </ol>
      ) : (
        <span className={css.Hint}>{card.empty ?? 'Nichts hier.'}</span>
      )}
      {more > 0 && <span className={css.Hint}>… und {more} weitere</span>}
      <CardActions actions={card.actions} />
    </div>
  );
}

const trimNumber = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function BarChart({ chart }: { chart: Chart }) {
  const max = Math.max(...chart.items.map((i) => i.value), 1);
  return (
    <div className={css.HelpGroup} data-chart={chart.title}>
      <p className={css.SectionTitle}>{chart.title}</p>
      {chart.items.map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className={css.ChartRow}>
          <div className={css.ChartHead}>
            <span className={css.QueueIndex}>{i + 1}.</span>
            <span className={css.ChartLabel} title={item.label}>
              {item.label}
            </span>
            {item.sub && <span className={css.ChartSub}>{item.sub}</span>}
            <span className={css.ChartValue}>
              {trimNumber(item.value)}
              {chart.unit ? ` ${chart.unit}` : ''}
            </span>
          </div>
          <div
            className={css.Bar}
            role="progressbar"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={item.value}
          >
            <div
              className={css.BarFill}
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsCard({ card }: { card: Extract<BotCard, { kind: 'stats' }> }) {
  return (
    <div className={css.Card} data-bot-card="stats">
      <p className={css.Title}>{card.title}</p>
      {card.charts.map((chart) => (
        <BarChart key={chart.title} chart={chart} />
      ))}
      <CardActions actions={card.actions} />
    </div>
  );
}

function NoteCard({ card }: { card: Extract<BotCard, { kind: 'note' }> }) {
  return (
    <div className={css.Note} data-bot-card="note" data-tone={card.tone} role="status">
      {card.icon && (
        <span className={css.NoteIcon} aria-hidden>
          {card.icon}
        </span>
      )}
      <span>{card.text}</span>
    </div>
  );
}

/** The drawn card of a bot message (see plugins/botCard.ts, docs/bot-cards.md). */
export function BotCardView({ card }: { card: BotCard }) {
  switch (card.kind) {
    case 'track':
      return card.controls ? (
        <PlayerCard card={card} controls={card.controls} />
      ) : (
        <TrackCard card={card} />
      );
    case 'queue':
      return <QueueCard card={card} />;
    case 'help':
      return <HelpCard card={card} />;
    case 'list':
      return <ListCard card={card} />;
    case 'stats':
      return <StatsCard card={card} />;
    default:
      return <NoteCard card={card} />;
  }
}
