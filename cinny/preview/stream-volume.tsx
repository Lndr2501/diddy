// The volume of somebody else's screen share: the real right-click menu (CallUserMenu) and the
// real stream tile (ShareTile) with real CSS, on a fake Element Call document whose share tile
// carries a fake view model, as React leaves it in the call. Open
// /preview/stream-volume.html?theme=dark-theme (any theme id); &audio=0 = a share without sound.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { createStore, Provider } from 'jotai';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { color, configClass, varsClass } from 'folds';
import '../src/index.css';
import { MatrixClientProvider } from '../src/app/hooks/useMatrixClient';
import { RoomProvider } from '../src/app/hooks/useRoom';
import { ShareTile } from '../src/app/features/call/CallStage';
import { CallUserMenu } from '../src/app/components/CallUserMenu';
import { openCallUserMenu } from '../src/app/plugins/callFrameMenu';
import { callEmbedAtom } from '../src/app/state/callEmbed';
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

const SHARER = '@gho:x.de';
const SHARE_ID = `${SHARER}:DEVICE:screen-share`;

/** Element Call's behaviour: a value plus subscribers. */
const behavior = <T,>(initial: T) => {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get value() {
      return value;
    },
    next(v: T) {
      value = v;
      listeners.forEach((fn) => fn(v));
    },
    subscribe(fn: (v: T) => void) {
      listeners.add(fn);
      fn(value);
      return { unsubscribe: () => listeners.delete(fn) };
    },
  };
};

// Element Call's model of gho's screen share, with its playback volume logic
const volume$ = behavior(1);
let committed = 1;
const shareVm = {
  id: SHARE_ID,
  type: 'screen share',
  local: false,
  playbackVolume$: volume$,
  audioEnabled$: behavior(params.get('audio') !== '0'),
  adjustPlaybackVolume: (v: number) => volume$.next(v),
  commitPlaybackVolume: () => {
    if (volume$.value !== 0) committed = volume$.value;
  },
  togglePlaybackMuted: () => volume$.next(volume$.value === 0 ? committed : 0),
};
(window as unknown as { shareVm: typeof shareVm }).shareVm = shareVm;

// the share's tile in the call document, with the React fiber chain up to the spotlight item
const ecTile = {
  __reactFiber$preview: {
    memoizedProps: { className: 'media' },
    return: { memoizedProps: { vm: shareVm } },
  },
  getAttribute: (name: string) => (name === 'data-id' ? SHARE_ID : null),
  // the avatar label inside a tile names its owner
  querySelector: (selector: string) =>
    selector === '[aria-label]' ? { getAttribute: () => SHARER } : null,
};
const callDoc = {
  querySelectorAll: () => [ecTile],
} as unknown as Document;

const fakeRoom = {
  roomId: '!r:x.de',
  getMember: (userId: string) => (userId === SHARER ? { rawDisplayName: 'gho' } : undefined),
};
const fakeMx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key) => {
    if (key === 'getUserId' || key === 'getSafeUserId') return () => '@anton:x.de';
    if (key === 'getDomain') return () => 'x.de';
    if (key === 'getRoom') return () => fakeRoom;
    if (key === 'on' || key === 'off' || key === 'removeListener') return () => undefined;
    if (typeof key === 'string' && /^get(Visible)?Rooms$/.test(key)) return () => [];
    return () => undefined;
  },
}) as never;

const store = createStore();
store.set(callEmbedAtom, {
  roomId: '!r:x.de',
  document: callDoc,
  iframe: { style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  dispose: () => undefined,
} as never);

const share = { id: SHARE_ID, userId: SHARER, name: 'gho' };

createRoot(document.getElementById('root') as HTMLElement).render(
  <Provider store={store}>
    <MemoryRouter>
      <MatrixClientProvider value={fakeMx}>
        <RoomProvider value={fakeRoom as never}>
          <div style={{ display: 'flex', height: 'calc(100vh - 40px)', width: '60vw' }}>
            <ShareTile share={share} doc={callDoc} onSelect={() => undefined} />
          </div>
          <CallUserMenu />
        </RoomProvider>
      </MatrixClientProvider>
    </MemoryRouter>
  </Provider>
);

if (params.get('menu') !== '0') {
  window.setTimeout(() => openCallUserMenu(SHARER, 420, 260, SHARE_ID), 300);
}
