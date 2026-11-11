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

function TrackCard({ card }: { card: Extract<BotCard, { kind: 'track' }> }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { send, busy, enabled } = useBotCommand();
  const [hover, setHover] = useState<number>();
  const busyState = card.state === 'searching' || card.state === 'downloading';
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
  const cover = card.thumbnail
    ? mxcUrlToHttp(mx, card.thumbnail, useAuthentication, 128, 128, 'crop') ?? undefined
    : undefined;

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

  const bar = (
    <div className={css.Bar}>
      <div
        className={css.BarFill}
        data-paused={card.state === 'paused' || undefined}
        style={{ width: `${((ratio ?? 0) * 100).toFixed(1)}%` }}
      />
    </div>
  );

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
      {ratio !== undefined && position !== undefined && duration !== undefined && (
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
              aria-valuetext={`${formatCardTime(position)} von ${formatCardTime(duration)}`}
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
              aria-valuetext={`${formatCardTime(position)} von ${formatCardTime(duration)}`}
              aria-label="Wiedergabe"
            >
              {bar}
            </div>
          )}
          <div className={css.Times}>
            <span>{formatCardTime(position)}</span>
            {card.volume !== undefined && <span>🔊 {Math.round(card.volume)}</span>}
            <span>{formatCardTime(duration)}</span>
          </div>
        </div>
      )}
      {ratio === undefined && duration !== undefined && (
        <div className={css.Times}>
          <span>Länge {formatCardTime(duration)}</span>
        </div>
      )}
      {card.note && <span className={css.Hint}>{card.note}</span>}
      <CardActions actions={card.actions} />
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
      return <TrackCard card={card} />;
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
