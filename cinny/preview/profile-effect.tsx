// Renders the profile effect overlay (#86) on dummy cards: every built-in preset, plus an
// uploaded effect from your own pictures. No Matrix server needed.
// Open /preview/profile-effect.html; ?still=1 shows the reduced-motion look. Own pictures:
// ?layer=<url>&start=<ms>&duration=<ms>&delay=<ms> (repeat per layer), &stillUrl=<url>.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { color, configClass, varsClass } from 'folds';
import '../src/index.css';
import { MatrixClientProvider } from '../src/app/hooks/useMatrixClient';
import { DarkTheme } from '../src/app/hooks/useTheme';
import { ProfileEffectOverlay } from '../src/app/components/diddy/ProfileEffect';
import { PROFILE_EFFECT_PRESETS } from '../src/app/plugins/diddy/profileEffect';
import type { ProfileEffect } from '../src/app/plugins/diddy/types';

document.body.classList.add(configClass, varsClass, ...DarkTheme.classNames);
document.body.style.backgroundColor = color.Background.Container;

const params = new URLSearchParams(window.location.search);
const animate = params.get('still') !== '1';
const files = params.getAll('layer');
const num = (key: string, i: number) => Number(params.getAll(key)[i] ?? 0) || 0;

// mxc://preview/l<n> stands for the n-th ?layer= url, mxc://preview/still for ?stillUrl=
const fakeMx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key) => {
    if (key === 'mxcUrlToHttp') {
      return (mxc: string) => {
        const id = mxc.split('/').pop() ?? '';
        if (id === 'still') return params.get('stillUrl');
        return files[Number(id.slice(1))] ?? null;
      };
    }
    if (key === 'getUserId' || key === 'getSafeUserId') return () => '@lndr:x.de';
    return () => undefined;
  },
}) as never;

const own: ProfileEffect | undefined = files.length
  ? {
      layers: files.slice(0, 4).map((_, i) => ({
        mxc: `mxc://preview/l${i}`,
        start: num('start', i),
        duration: num('duration', i),
        loop: true,
        loopDelay: num('delay', i),
        x: 0,
        y: 0,
        w: 450,
        h: 880,
        z: i,
      })),
      stillMxc: params.get('stillUrl') ? 'mxc://preview/still' : undefined,
    }
  : undefined;

function Card({ label, effect }: { label: string; effect?: ProfileEffect }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 300,
        height: 330,
        borderRadius: 16,
        background: color.Surface.Container,
        color: color.Surface.OnContainer,
        border: `1px solid ${color.Surface.ContainerLine}`,
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 90, background: 'linear-gradient(135deg, #3b2a6b, #1b1d33)' }} />
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{label}</div>
        <div style={{ opacity: 0.7, marginTop: 4 }}>@lndr:x.de</div>
        <button type="button" style={{ marginTop: 90, width: '100%', padding: 8 }}>
          Clicks pass through
        </button>
      </div>
      <ProfileEffectOverlay effect={effect} animate={animate} />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <MatrixClientProvider value={fakeMx}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {own && <Card label="Own effect" effect={own} />}
      {PROFILE_EFFECT_PRESETS.map((p) => (
        <Card key={p.id} label={p.label} effect={{ preset: p.id }} />
      ))}
    </div>
  </MatrixClientProvider>
);
