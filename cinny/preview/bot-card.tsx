// Renders the real bot cards (BotCardView + real CSS) with sample data. Open
// /preview/bot-card.html?theme=dark-theme (any theme id).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { color, configClass, varsClass } from 'folds';
import '../src/index.css';
import { MatrixClientProvider } from '../src/app/hooks/useMatrixClient';
import { RoomProvider } from '../src/app/hooks/useRoom';
import { BotCardView } from '../src/app/components/message/BotCard';
import { parseBotCard } from '../src/app/plugins/botCard';
import {
  AmberTheme,
  ButterTheme,
  DarkTheme,
  DiddyTheme,
  GreenTheme,
  LightTheme,
  PurpleTheme,
  RedTheme,
  SilverTheme,
} from '../src/app/hooks/useTheme';

const THEMES = [
  LightTheme,
  SilverTheme,
  DarkTheme,
  ButterTheme,
  DiddyTheme,
  RedTheme,
  GreenTheme,
  PurpleTheme,
  AmberTheme,
];
const params = new URLSearchParams(window.location.search);
const theme = THEMES.find((t) => t.id === params.get('theme')) ?? DarkTheme;
document.body.classList.add(configClass, varsClass, ...theme.classNames);
document.body.style.backgroundColor = color.Background.Container;
document.body.style.color = color.Background.OnContainer;

const sent: string[] = [];
(window as unknown as { __sent: string[] }).__sent = sent;
const fakeMx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key) => {
    if (key === 'sendMessage')
      return (_room: string, content: { body: string }) => {
        sent.push(content.body);
        return Promise.resolve({});
      };
    if (key === 'getUserId' || key === 'getSafeUserId') return () => '@lndr:x.de';
    return () => undefined;
  },
}) as never;
const fakeRoom = { roomId: '!r:x.de' } as never;

const wrap = (card: Record<string, unknown>) => ({
  msgtype: 'm.notice',
  body: 'x',
  'dev.diddy.card': { v: 1, ...card },
});
const now = Date.now();
const samples = [
  wrap({
    kind: 'track',
    state: 'searching',
    title: 'cherry cherry lady',
    note: 'Suche auf YouTube …',
  }),
  wrap({
    kind: 'track',
    state: 'downloading',
    title: 'Modern Talking - Cheri Cheri Lady (Official Video)',
    duration: 197,
  }),
  wrap({
    kind: 'track',
    state: 'playing',
    title: 'Modern Talking - Cheri Cheri Lady (Official Video)',
    artist: 'Modern Talking',
    duration: 197,
    position: 62,
    startedAt: now,
    actions: [
      { label: '⏸ Pause', send: '!pause' },
      { label: '⏭ Weiter', send: '!skip' },
      { label: '📜 Warteschlange', send: '!queue' },
      { label: '⏹ Stopp', send: '!stop' },
    ],
  }),
  wrap({
    kind: 'track',
    state: 'paused',
    title: 'Daft Punk – Around the World',
    artist: 'Daft Punk',
    duration: 429,
    position: 215,
    actions: [{ label: '▶ Weiter', send: '!resume' }],
  }),
  wrap({
    kind: 'queue',
    now: { title: 'Modern Talking - Cheri Cheri Lady', artist: 'Modern Talking' },
    total: 5,
    items: [
      { title: 'Daft Punk – Around the World', duration: 429 },
      { title: 'Rick Astley – Never Gonna Give You Up', duration: 213 },
      { title: 'a-ha – Take On Me', duration: 255 },
    ],
    actions: [
      { label: '🗑 Leeren', send: '!clear' },
      { label: '🔀 Mischen', send: '!shuffle' },
    ],
  }),
  wrap({ kind: 'note', icon: '🔊', text: 'Lautstärke: 80', tone: 'info' }),
  wrap({
    kind: 'note',
    icon: '⚠️',
    text: 'Download fehlgeschlagen: Video ist nicht verfügbar',
    tone: 'error',
  }),
  wrap({
    kind: 'help',
    groups: [
      {
        title: 'Wiedergabe',
        items: [
          {
            usage: '!play <Link oder Suchbegriff>',
            desc: 'Link von fast jeder Seite (yt-dlp), sonst YouTube-Suche',
          },
          { usage: '!pause · !resume', desc: 'pausieren · weiter' },
          { usage: '!skip · !previous', desc: 'nächster · vorheriger Titel' },
          { usage: '!seek <mm:ss | +30 | -30>', desc: 'springen' },
        ],
      },
      {
        title: 'Warteschlange',
        items: [
          { usage: '!queue · !clear', desc: 'anzeigen · leeren' },
          { usage: '!shuffle · !loop on|off', desc: 'mischen · Titel wiederholen' },
        ],
      },
      {
        title: 'Call',
        items: [
          { usage: '!joincall · !leavecall', desc: 'Bot kommt in den Call · verlässt ihn' },
          { usage: '!volume <0-300>', desc: 'Lautstärke (60 = Original)' },
        ],
      },
    ],
    note: 'Steuern dürfen nur Leute, die selbst im Call sind.',
  }),
];

createRoot(document.getElementById('root') as HTMLElement).render(
  <MatrixClientProvider value={fakeMx}>
    <RoomProvider value={fakeRoom}>
      {samples.map((content, i) => {
        const card = parseBotCard(content);
        // eslint-disable-next-line react/no-array-index-key
        return card ? <BotCardView key={i} card={card} /> : <div key={i}>invalid card</div>;
      })}
    </RoomProvider>
  </MatrixClientProvider>
);
