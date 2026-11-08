import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { ProfileEffect, ProfileEffectLayer } from '../../plugins/diddy/types';
import { sanitizeProfileEffect } from '../../plugins/diddy/sanitize';
import {
  EFFECT_IMAGE_TYPES,
  EFFECT_REF_HEIGHT,
  EFFECT_REF_WIDTH,
  MAX_EFFECT_LAYER_BYTES,
  MAX_EFFECT_TOTAL_BYTES,
  ProfileEffectPresetId,
  imageInfo,
  layerStateAt,
  presetParticles,
  resolveProfileEffect,
} from '../../plugins/diddy/profileEffect';
import { useMxcUrl } from '../../plugins/diddy/media';
import { downloadMedia } from '../../utils/matrix';
import { useAvatarPrefs } from '../../state/avatarPrefs';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { PositionedImg } from './PositionedImg';
import * as css from './ProfileEffect.css';

/** Whether profile effects may move for this viewer: their own switch and the system setting. */
export const useProfileEffectAnimation = (): boolean => {
  const prefs = useAvatarPrefs();
  const reduced = usePrefersReducedMotion();
  return prefs.profileEffects && !reduced;
};

// --- scaling ----------------------------------------------------------------------------------

/** Scale of the 450 x 880 reference box so it covers the overlay, anchored at the top. */
const useCoverScale = (ref: React.RefObject<HTMLElement>): number => {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.max(width / EFFECT_REF_WIDTH, height / EFFECT_REF_HEIGHT));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
};

const refBoxStyle = (scale: number): CSSProperties => ({
  width: EFFECT_REF_WIDTH,
  height: EFFECT_REF_HEIGHT,
  transform: `translateX(-50%) scale(${scale})`,
});

const layerBox = (layer: Pick<ProfileEffectLayer, 'x' | 'y' | 'w' | 'h' | 'z'>): CSSProperties => ({
  left: layer.x,
  top: layer.y,
  width: layer.w,
  height: layer.h,
  zIndex: layer.z,
});

// --- uploaded layers ----------------------------------------------------------------------------

// the last few downloaded layers, so opening the same card again does not download them again
const blobCache = new Map<string, Promise<Blob | undefined>>();
const BLOB_CACHE_SIZE = 8;

/** Downloads a layer and checks it really is a PNG / WebP / GIF within the size cap. */
const loadLayer = (url: string): Promise<Blob | undefined> => {
  const cached = blobCache.get(url);
  if (cached) return cached;
  const promise = downloadMedia(url)
    .then(async (blob) => {
      if (blob.size <= 0 || blob.size > MAX_EFFECT_LAYER_BYTES) return undefined;
      const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
      const info = imageInfo(head);
      if (!info || !EFFECT_IMAGE_TYPES.includes(info.type)) return undefined;
      // served with the type from the bytes, never with what the server said
      return new Blob([blob], { type: info.type });
    })
    .catch(() => undefined);
  blobCache.set(url, promise);
  if (blobCache.size > BLOB_CACHE_SIZE) {
    const oldest = blobCache.keys().next().value;
    if (oldest !== undefined) blobCache.delete(oldest);
  }
  promise.then((blob) => {
    if (!blob) blobCache.delete(url);
  });
  return promise;
};

/** All layer pictures once they are loaded (layers over the total cap are left out). */
const useLayerBlobs = (urls: (string | undefined)[]): (Blob | undefined)[] | undefined => {
  const key = urls.join('\n');
  const [blobs, setBlobs] = useState<(Blob | undefined)[]>();
  useEffect(() => {
    let cancelled = false;
    setBlobs(undefined);
    Promise.all(urls.map((url) => (url ? loadLayer(url) : Promise.resolve(undefined)))).then(
      (loaded) => {
        if (cancelled) return;
        let total = 0;
        setBlobs(
          loaded.map((blob) => {
            if (!blob) return undefined;
            total += blob.size;
            return total <= MAX_EFFECT_TOTAL_BYTES ? blob : undefined;
          })
        );
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return blobs;
};

type LayerImgProps = { blob: Blob; layer: ProfileEffectLayer; startedAt: number };

/**
 * One layer: hidden until its start, then shown and restarted from its first frame on every
 * loop. A restart uses a new object url, which makes every engine (also WebKit) decode the
 * picture again from frame one; the old url is released.
 */
function LayerImg({ blob, layer, startedAt }: LayerImgProps) {
  const [state, setState] = useState(() => layerStateAt(layer, 0));
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const next = layerStateAt(layer, performance.now() - startedAt);
      setState((prev) =>
        prev.visible === next.visible && prev.cycle === next.cycle ? prev : next
      );
      if (Number.isFinite(next.nextChangeIn)) {
        timer = window.setTimeout(tick, Math.max(16, next.nextChangeIn + 1));
      }
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [layer, startedAt]);

  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!state.visible) {
      setUrl(undefined);
      return undefined;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob, state.visible, state.cycle]);

  if (!state.visible || !url) return null;
  return <img className={css.Layer} src={url} alt="" draggable={false} style={layerBox(layer)} />;
}

function AnimatedLayers({ layers }: { layers: ProfileEffectLayer[] }) {
  const urls = layers.map((l) => l.mxc);
  // hooks per layer (at most MAX_EFFECT_LAYERS, a fixed count per effect)
  const u0 = useMxcUrl(urls[0], undefined, { animated: true });
  const u1 = useMxcUrl(urls[1], undefined, { animated: true });
  const u2 = useMxcUrl(urls[2], undefined, { animated: true });
  const u3 = useMxcUrl(urls[3], undefined, { animated: true });
  const blobs = useLayerBlobs([u0, u1, u2, u3].slice(0, layers.length));
  // the timeline starts once all pictures are there, so the layers stay in step
  const startedAt = useMemo(() => (blobs ? performance.now() : 0), [blobs]);
  if (!blobs) return null;
  return (
    <>
      {layers.map((layer, i) => {
        const blob = blobs[i];
        return blob ? (
          // eslint-disable-next-line react/no-array-index-key
          <LayerImg key={i} blob={blob} layer={layer} startedAt={startedAt} />
        ) : null;
      })}
    </>
  );
}

function StillLayers({ stillMxc, layers }: { stillMxc?: string; layers: ProfileEffectLayer[] }) {
  const stillUrl = useMxcUrl(stillMxc, undefined, { animated: true });
  const u0 = useMxcUrl(layers[0]?.mxc, undefined, { animated: true });
  const u1 = useMxcUrl(layers[1]?.mxc, undefined, { animated: true });
  const u2 = useMxcUrl(layers[2]?.mxc, undefined, { animated: true });
  const u3 = useMxcUrl(layers[3]?.mxc, undefined, { animated: true });
  const [failed, setFailed] = useState(false);
  if (stillUrl && !failed) {
    return (
      <img
        className={css.Layer}
        src={stillUrl}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
        style={{ left: 0, top: 0, width: EFFECT_REF_WIDTH, height: EFFECT_REF_HEIGHT }}
      />
    );
  }
  // no still picture: the first frame of every layer
  const urls = [u0, u1, u2, u3];
  return (
    <>
      {layers.map((layer, i) => {
        const url = urls[i];
        return url ? (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className={css.Layer} style={layerBox(layer)}>
            <PositionedImg src={url} paused style={{ objectFit: 'contain' }} />
          </div>
        ) : null;
      })}
    </>
  );
}

// --- built-in presets ---------------------------------------------------------------------------

const TINTS: Record<ProfileEffectPresetId, string[]> = {
  sparkles: ['#ffe9a8', '#c9b8ff', '#9fe8ff'],
  petals: ['#ff8fb4', '#ff6f9f', '#f7a8c8'],
  embers: ['#ff9d3c', '#ffb347', '#ff6a2b'],
  snow: ['#ffffff'],
  hearts: ['#ff6f9f'],
  aurora: ['rgba(90, 255, 190, 0.5)', 'rgba(110, 160, 255, 0.45)', 'rgba(200, 120, 255, 0.4)'],
};

const TRACK: Record<ProfileEffectPresetId, keyof typeof css.Track> = {
  sparkles: 'fixed',
  petals: 'fall',
  embers: 'rise',
  snow: 'fall',
  hearts: 'rise',
  aurora: 'fixed',
};

function PresetParticles({ id }: { id: ProfileEffectPresetId }) {
  const particles = useMemo(() => presetParticles(id), [id]);
  const tints = TINTS[id];
  const track = TRACK[id];
  return (
    <>
      {particles.map((p, i) => {
        const vars = {
          '--fx-size': id === 'aurora' ? `${p.size}` : `${p.size}px`,
          '--fx-dur': `${p.duration}s`,
          '--fx-dur2': `${Math.round((p.duration / 3) * 100) / 100}s`,
          '--fx-delay': `${p.delay}s`,
          '--fx-drift': `${p.drift}px`,
          '--fx-spin': `${p.spin}deg`,
          '--fx-tint': tints[Math.floor(p.tone * tints.length) % tints.length],
        } as CSSProperties;
        if (id === 'aurora') {
          return (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={css.Particle.aurora}
              style={{ ...vars, left: `${p.x - p.size / 2}%`, width: `${p.size}%` }}
            />
          );
        }
        const trackStyle: CSSProperties =
          track === 'fixed' ? { left: `${p.x}%`, top: `${p.y}%` } : { left: `${p.x}%` };
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className={css.Track[track]} style={{ ...vars, ...trackStyle }}>
            <div className={css.Particle[id]} />
          </div>
        );
      })}
    </>
  );
}

// --- overlay ------------------------------------------------------------------------------------

/** Uploaded effects only play while the window is visible (they restart when it comes back). */
const useDocumentVisible = (): boolean => {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  return visible;
};

type ProfileEffectOverlayProps = {
  effect: ProfileEffect | undefined;
  /** false: nothing moves (viewer setting / reduced motion), see useProfileEffectAnimation */
  animate: boolean;
  className?: string;
};

/**
 * The profile effect over a card (#86). Put it as the last child of the (position: relative)
 * card; it covers it, follows its rounded corners and lets every click through.
 */
export function ProfileEffectOverlay({ effect, animate, className }: ProfileEffectOverlayProps) {
  // profiles from the sync are already sanitised; the settings preview passes a draft
  const resolved = useMemo(
    () => resolveProfileEffect(sanitizeProfileEffect(effect), animate),
    [effect, animate]
  );
  const ref = useRef<HTMLDivElement>(null);
  const scale = useCoverScale(ref);
  const visibleTab = useDocumentVisible();

  if (!resolved) return null;
  const still = resolved.kind === 'preset' ? !resolved.animate : resolved.kind === 'still';

  let content: React.ReactNode = null;
  if (resolved.kind === 'preset') content = <PresetParticles id={resolved.id} />;
  else if (scale > 0) {
    content = (
      <div className={css.RefBox} style={refBoxStyle(scale)}>
        {resolved.kind === 'layers' && visibleTab ? (
          <AnimatedLayers layers={resolved.layers} />
        ) : (
          <StillLayers
            stillMxc={resolved.kind === 'still' ? resolved.stillMxc : undefined}
            layers={resolved.layers}
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      aria-hidden
      className={classNames(css.Overlay, still && css.Still, className)}
      data-effect={resolved.kind === 'preset' ? resolved.id : 'custom'}
    >
      {content}
    </div>
  );
}
