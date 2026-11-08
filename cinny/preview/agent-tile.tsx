// Renders the real call tiles (PersonTile + real CSS) with fake people, for preview images and
// the "talking to agent" look. Open /preview/agent-tile.html?theme=dark-theme (any theme id).
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { color, configClass, varsClass } from 'folds';
import '../src/index.css';
import { MatrixClientProvider } from '../src/app/hooks/useMatrixClient';
import { RoomProvider } from '../src/app/hooks/useRoom';
import { PersonTile } from '../src/app/features/call/CallStage';
import { setRemoteAgentTalking } from '../src/app/state/agentVoice';
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

const fakeMx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key) => {
    if (key === 'getUserId' || key === 'getSafeUserId') return () => '@lndr:x.de';
    if (key === 'getDomain') return () => 'x.de';
    if (key === 'on' || key === 'off' || key === 'removeListener') return () => undefined;
    if (typeof key === 'string' && /^get(Visible)?Rooms$/.test(key)) return () => [];
    return () => undefined;
  },
}) as never;
const fakeRoom = { roomId: '!r:x.de', getMember: () => undefined } as never;

const people = [
  { userId: '@lndr:x.de', name: 'Lndr', speaking: false, muted: false },
  { userId: '@anton:x.de', name: 'Anton', speaking: false, muted: false },
  { userId: '@luis:x.de', name: 'Luis', speaking: true, muted: false },
  { userId: '@mara:x.de', name: 'Mara', speaking: false, muted: true },
];
// Anton talks to an agent right now
setRemoteAgentTalking(params.get('agent') === '0' ? [] : ['@anton:x.de']);

createRoot(document.getElementById('root') as HTMLElement).render(
  <MatrixClientProvider value={fakeMx}>
    <RoomProvider value={fakeRoom}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 14,
          height: 'calc(100vh - 40px)',
          width: 'calc(100vw - 40px)',
          gridColumn: '1 / -1',
        }}
      >
        {people.map((p) => (
          <div key={p.userId} style={{ display: 'flex', minHeight: 0, minWidth: 0 }}>
            <PersonTile person={p as never} onSelect={() => undefined} />
          </div>
        ))}
      </div>
    </RoomProvider>
  </MatrixClientProvider>
);
