import React, { useEffect, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useRoom } from '../../hooks/useRoom';
import { mxcUrlToHttp } from '../../utils/matrix';
import {
  BotCard,
  CardAction,
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

/** A card button types its bot command into the chat as you (nothing is sent without a click). */
function CardActions({ actions }: { actions: CardAction[] }) {
  const mx = useMatrixClient();
  const room = useRoom();
  const [sent, setSent] = useState<string>();
  if (actions.length === 0) return null;
  const send = (command: string) => {
    setSent(command);
    mx.sendMessage(room.roomId, { msgtype: 'm.text', body: command } as never)
      .catch(() => undefined)
      .finally(() => window.setTimeout(() => setSent(undefined), 800));
  };
  return (
    <div className={css.Actions}>
      {actions.map((a) => (
        <button
          key={a.send}
          type="button"
          className={css.ActionButton}
          disabled={sent !== undefined}
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
  const busy = card.state === 'searching' || card.state === 'downloading';
  const now = useNow(card.state === 'playing' && card.duration !== undefined);
  const position = livePosition(card, now);
  const ratio =
    position !== undefined && card.duration ? Math.min(1, position / card.duration) : undefined;
  const cover = card.thumbnail
    ? mxcUrlToHttp(mx, card.thumbnail, useAuthentication, 128, 128, 'crop') ?? undefined
    : undefined;
  return (
    <div className={css.Card} data-bot-card="track">
      <div className={css.TrackRow}>
        <div className={css.Cover} aria-hidden>
          {cover ? <img className={css.CoverImg} src={cover} alt="" /> : '🎵'}
        </div>
        <div className={css.TrackText}>
          <span className={css.StateChip} data-state={card.state}>
            <span className={css.Dot} data-busy={busy || undefined} />
            {STATE_LABEL[card.state]}
          </span>
          <p className={css.Title}>{card.title}</p>
          {card.artist && <span className={css.Artist}>{card.artist}</span>}
        </div>
      </div>
      {ratio !== undefined && position !== undefined && card.duration !== undefined && (
        <div
          className={css.Progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={Math.round(card.duration)}
          aria-valuenow={Math.round(position)}
          aria-label="Wiedergabe"
        >
          <div className={css.Bar}>
            <div
              className={css.BarFill}
              data-paused={card.state === 'paused' || undefined}
              style={{ width: `${(ratio * 100).toFixed(1)}%` }}
            />
          </div>
          <div className={css.Times}>
            <span>{formatCardTime(position)}</span>
            <span>{formatCardTime(card.duration)}</span>
          </div>
        </div>
      )}
      {ratio === undefined && card.duration !== undefined && (
        <div className={css.Times}>
          <span>Länge {formatCardTime(card.duration)}</span>
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
    default:
      return <NoteCard card={card} />;
  }
}
