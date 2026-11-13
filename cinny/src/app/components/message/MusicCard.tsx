import React, { MouseEvent, useEffect, useRef, useState } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../utils/matrix';
import { MusicCard, musicClock } from '../../plugins/musicCard';
import * as css from './MusicCard.css';

/** One preview plays at a time, across all cards. */
let playing: HTMLAudioElement | undefined;

function usePreview(src: string | undefined) {
  const audio = useRef<HTMLAudioElement>();
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (playing === audio.current) playing = undefined;
    },
    []
  );

  const toggle = () => {
    if (!src) return;
    if (!audio.current) {
      const a = new Audio(src);
      a.preload = 'auto';
      a.addEventListener('playing', () => setState('playing'));
      a.addEventListener('pause', () => setState('idle'));
      a.addEventListener('ended', () => {
        setState('idle');
        setProgress(0);
        a.currentTime = 0;
      });
      a.addEventListener('error', () => setState('idle'));
      a.addEventListener('timeupdate', () => {
        if (a.duration > 0) setProgress(a.currentTime / a.duration);
      });
      audio.current = a;
    }
    const a = audio.current;
    if (!a.paused) {
      a.pause();
      return;
    }
    if (playing && playing !== a) playing.pause();
    playing = a;
    setState('loading');
    a.play().catch(() => setState('idle'));
  };
  return { state, progress, toggle };
}

function serviceLabel(card: MusicCard): string {
  if (card.service === 'apple') return ' Music';
  if (card.service === 'spotify') return 'Spotify';
  try {
    return new URL(card.url).hostname;
  } catch {
    return '';
  }
}

/** A shared song like iMessage's Apple Music lyrics card; a click opens the song. */
export function MusicCardView({ card }: { card: MusicCard }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const cover = card.artwork
    ? mxcUrlToHttp(mx, card.artwork, useAuthentication, 600, 600, 'scale') ?? undefined
    : undefined;
  const { state, progress, toggle } = usePreview(card.preview);
  const hasLyrics = card.lyrics.length > 0;
  const heading = card.artist ? `${card.title} — ${card.artist}` : card.title;

  const onPlay = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };

  return (
    <a
      className={css.Card}
      href={card.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={hasLyrics ? `${card.lyrics.join(' ')}, ${heading}` : heading}
    >
      {cover && <div className={css.Backdrop} style={{ backgroundImage: `url("${cover}")` }} />}
      <div className={css.Shade} />
      {hasLyrics && (
        <div className={css.Lyrics}>
          <p className={css.LyricsText}>{card.lyrics.join('\n')}</p>
          {card.time !== undefined && <span className={css.Time}>{musicClock(card.time)}</span>}
        </div>
      )}
      <div className={css.Footer} data-split={hasLyrics || undefined}>
        {!hasLyrics &&
          (cover ? <img className={css.Cover} src={cover} alt="" /> : <div className={css.Cover} />)}
        <div className={css.Meta}>
          <span className={css.Title}>{card.title}</span>
          {card.artist && <span className={css.Artist}>{card.artist}</span>}
          <span className={css.Service}>{serviceLabel(card)}</span>
        </div>
        {card.preview && (
          <button
            type="button"
            className={css.Play}
            onClick={onPlay}
            aria-label={state === 'playing' ? 'Pause preview' : 'Play preview'}
          >
            {state === 'playing' && (
              <svg className={css.Ring} viewBox="0 0 46 46" aria-hidden>
                <circle
                  cx="23"
                  cy="23"
                  r="21.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 135.1} 135.1`}
                />
              </svg>
            )}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="currentColor">
              {state === 'playing' ? (
                <>
                  <rect x="3" y="2" width="4" height="14" rx="1.2" />
                  <rect x="11" y="2" width="4" height="14" rx="1.2" />
                </>
              ) : (
                <path d="M5 2.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C5.9 1.3 5 1.8 5 2.6z" />
              )}
            </svg>
          </button>
        )}
      </div>
    </a>
  );
}
