// Renders profile frames (#87) around dummy cards: every built-in preset, plus a frame from your
// own pictures. No Matrix server needed. Open /preview/profile-frame.html. Own pictures:
// ?top=<url>&bottom=<url>&inner=1200&ot=211&ob=186&oh=56 (pictures in preview/local/ are not
// committed), or ?fill=<url> for one picture over the whole card.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { color, configClass, varsClass } from 'folds';
import '../src/index.css';
import { MatrixClientProvider } from '../src/app/hooks/useMatrixClient';
import { DarkTheme } from '../src/app/hooks/useTheme';
import { ProfileFrameBox } from '../src/app/components/diddy/ProfileFrame';
import { PROFILE_FRAME_PRESETS } from '../src/app/plugins/diddy/profileFrame';
import type { ProfileFrame } from '../src/app/plugins/diddy/types';

document.body.classList.add(configClass, varsClass, ...DarkTheme.classNames);
document.body.style.backgroundColor = color.Background.Container;

const params = new URLSearchParams(window.location.search);
const num = (key: string, fallback: number) => Number(params.get(key) ?? fallback) || 0;

// mxc://preview/<name> stands for the ?<name>= url
const fakeMx = new Proxy({} as Record<string, unknown>, {
  get: (_t, key) => {
    if (key === 'mxcUrlToHttp') {
      return (mxc: string) => params.get(mxc.split('/').pop() ?? '') ?? null;
    }
    if (key === 'getUserId' || key === 'getSafeUserId') return () => '@lndr:x.de';
    return () => undefined;
  },
}) as never;

const layers: ProfileFrame['layers'] = [];
if (params.get('top')) layers.push({ mxc: 'mxc://preview/top', order: 'front', anchor: 'top' });
if (params.get('bottom')) {
  layers.push({ mxc: 'mxc://preview/bottom', order: 'front', anchor: 'bottom' });
}
if (params.get('fill')) layers.push({ mxc: 'mxc://preview/fill', order: 'front', anchor: 'fill' });
const own: ProfileFrame | undefined = layers.length
  ? {
      layers,
      innerWidth: num('inner', 1200),
      overflowTop: num('ot', 0),
      overflowBottom: num('ob', 0),
      overflowHorizontal: num('oh', 0),
    }
  : undefined;

function Card({ label, frame, width }: { label: string; frame?: ProfileFrame; width: number }) {
  return (
    <ProfileFrameBox frame={frame} width={`${width}px`}>
      <div
        style={{
          position: 'relative',
          height: 330,
          borderRadius: 18,
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
      </div>
    </ProfileFrameBox>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <MatrixClientProvider value={fakeMx}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      {own && <Card label="Own frame" frame={own} width={340} />}
      {own && <Card label="Own frame, big" frame={own} width={600} />}
      {PROFILE_FRAME_PRESETS.map((p) => (
        <Card key={p.id} label={p.label} frame={{ preset: p.id }} width={300} />
      ))}
    </div>
  </MatrixClientProvider>
);
