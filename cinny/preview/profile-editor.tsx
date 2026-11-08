// Renders the real Settings > Profile page (#105) with a fake Matrix client and a sample Diddy
// profile, no server needed. Open /preview/profile-editor.html?theme=dark-theme&tab=avatar&
// preview=members. Pictures cannot load (no media server): avatars show their initials.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { color, configClass, varsClass } from 'folds';
import '../src/index.css';
import { MatrixClientProvider } from '../src/app/hooks/useMatrixClient';
import { DarkTheme, LightTheme } from '../src/app/hooks/useTheme';
import { DiddyProfileSettings } from '../src/app/features/settings/diddy/DiddyProfileSettings';
import { OPTIONS_MARKER_EVENT, PROFILE_EVENT } from '../src/app/plugins/diddy/types';
import type { DiddyProfile } from '../src/app/plugins/diddy/types';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'light-theme' ? LightTheme : DarkTheme;
document.body.classList.add(configClass, varsClass, ...theme.classNames);
document.body.style.backgroundColor = color.Background.Container;

const ME = '@lndr:x.de';
const SAMPLE: DiddyProfile = {
  v: 1,
  nameStyle: {
    font: 'default',
    effect: 'glow',
    bold: true,
    gradient: { from: '#7aa2f7', to: '#c084fc', angle: 90 },
  },
  card: { from: '#3a3f8c', to: '#b04a8c', angle: 135, accent: '#ff7ab6' },
  nameplate: { preset: 'sunset', flow: true },
  effect: { preset: 'sparkles' },
  frame: { preset: 'gold' },
  status: (params.get('status') as DiddyProfile['status']) ?? 'dnd',
  bio: 'Builds Diddy. Likes homelabs, synths and long walks.',
  about: { pronouns: 'he/him', location: 'Berlin' },
  interests: ['Homelab', 'Music', 'Films'],
  links: [{ kind: 'github', url: 'https://github.com/Lndr2501' }],
  activity: { kind: 'music', text: 'Legacy', detail: 'PIXY (UK)' },
  cardLayout: { layout: (params.get('layout') as never) ?? 'standard' },
};

const event = (type: string, key: string, content: unknown) => ({
  getType: () => type,
  getStateKey: () => key,
  getContent: () => content,
  getSender: () => ME,
  getTs: () => Date.now() - 60000,
  getRoomId: () => '!opts:x.de',
});
const profileEvent = event(PROFILE_EVENT, ME, SAMPLE);
const markerEvent = event(OPTIONS_MARKER_EVENT, '', {});

// anything not listed answers undefined (or an empty list for get...s / get...Events)
const safe = <T extends object>(known: Record<string, unknown>): T =>
  new Proxy(known, {
    get: (target, key) => {
      if (key in target) return target[key as string];
      if (key === 'then') return undefined;
      if (typeof key === 'string' && /^get\w*(s|Events|Members|Rooms)$/.test(key)) return () => [];
      return () => undefined;
    },
  }) as T;

const optionsRoom = safe<Record<string, unknown>>({
  roomId: '!opts:x.de',
  name: 'Diddy Options',
  isSpaceRoom: () => false,
  isCallRoom: () => false,
  getMyMembership: () => 'join',
  getMember: () => ({ membership: 'join' }),
  loadMembersIfNeeded: () => Promise.resolve(),
  getLiveTimeline: () => ({ getEvents: () => [] }),
  currentState: safe({
    getStateEvents: (type: string, key?: string) => {
      if (key === undefined) return type === PROFILE_EVENT ? [profileEvent] : [];
      if (type === OPTIONS_MARKER_EVENT && key === '') return markerEvent;
      if (type === PROFILE_EVENT && key === ME) return profileEvent;
      return null;
    },
  }),
});

// one object: hooks compare the user they get between renders
const me = {
  userId: ME,
  displayName: 'Lndr',
  presence: 'online',
  presenceStatusMsg: params.get('msg') ?? undefined,
  currentlyActive: true,
  getLastActiveTs: () => Date.now(),
  on: () => undefined,
  off: () => undefined,
  removeListener: () => undefined,
};

const fakeMx = safe<Record<string, unknown>>({
  getUserId: () => ME,
  getSafeUserId: () => ME,
  getDomain: () => 'x.de',
  getRooms: () => [optionsRoom],
  getRoom: (id: string) => (id === '!opts:x.de' ? optionsRoom : null),
  getUser: (id: string) => (id === ME ? me : null),
  getProfileInfo: () => Promise.resolve({ displayname: 'Lndr' }),
  isRoomEncrypted: () => false,
  mxcUrlToHttp: () => null,
  on: () => undefined,
  off: () => undefined,
  removeListener: () => undefined,
  getAccountData: () => undefined,
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <MatrixClientProvider value={fakeMx as never}>
    <MemoryRouter>
      <div style={{ height: '100vh', display: 'flex' }}>
        <DiddyProfileSettings requestClose={() => undefined} />
      </div>
    </MemoryRouter>
  </MatrixClientProvider>
);
