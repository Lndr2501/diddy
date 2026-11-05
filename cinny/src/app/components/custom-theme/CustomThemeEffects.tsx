import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { color } from 'folds';
import { CUSTOM_THEME_ID, useActiveTheme } from '../../hooks/useTheme';
import { loadBackgroundMedia, useCustomTheme } from '../../state/customTheme';
import { darkPalette, withAlpha } from '../../../themePalette';

type VarMap = Record<string, string>;

const cssVarName = (token: string): string | undefined => /var\((--[^),\s]+)/.exec(token)?.[1];

/** Flattens the palette into { '--folds-var-name': value } using the folds color contract. */
const toCssVars = (palette: ReturnType<typeof darkPalette>, panelAlpha?: number): VarMap => {
  const vars: VarMap = {};
  const translucent = new Set(['Background', 'Surface', 'SurfaceVariant']);
  (Object.keys(palette) as (keyof typeof palette)[]).forEach((category) => {
    const tone = palette[category] as Record<string, string>;
    Object.keys(tone).forEach((key) => {
      const name = cssVarName((color as unknown as Record<string, Record<string, string>>)[category][key]);
      if (!name) return;
      const isPanel = panelAlpha !== undefined && translucent.has(category) && key.startsWith('Container');
      vars[name] = isPanel && key !== 'ContainerLine' && key !== 'OnContainer'
        ? withAlpha(tone[key], panelAlpha)
        : tone[key];
    });
  });
  return vars;
};

/**
 * Applies the custom theme: colors as inline CSS variables on <body>, plus a fixed layer behind the
 * app for the gradient / image / GIF / video. Renders nothing while another theme is active.
 */
export function CustomThemeEffects() {
  const theme = useActiveTheme();
  const config = useCustomTheme();
  const active = theme.id === CUSTOM_THEME_ID;
  const [mediaUrl, setMediaUrl] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);

  const hasMedia = active && config.mediaKind !== undefined;
  const hasBackdrop = active && (config.gradient || hasMedia);

  // colors
  useEffect(() => {
    if (!active) return undefined;
    const vars = toCssVars(
      darkPalette({ background: config.background, accent: config.accent, text: config.text }),
      hasBackdrop ? config.surfaceOpacity : undefined
    );
    Object.entries(vars).forEach(([name, value]) => document.body.style.setProperty(name, value));
    return () => {
      Object.keys(vars).forEach((name) => document.body.style.removeProperty(name));
    };
  }, [active, hasBackdrop, config.background, config.accent, config.text, config.surfaceOpacity]);

  // background file
  useEffect(() => {
    if (!hasMedia) {
      setMediaUrl(undefined);
      return undefined;
    }
    let url: string | undefined;
    let cancelled = false;
    loadBackgroundMedia()
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setMediaUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasMedia, config.mediaName]);

  // video sound: WebKit only allows unmuted autoplay after a user gesture, so fall back to muted
  // playback and unmute on the next click.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || config.mediaKind !== 'video') return undefined;
    video.volume = config.mediaVolume;
    video.muted = !config.mediaSound;
    const play = () => video.play().catch(() => {});
    play();
    if (!config.mediaSound) return undefined;
    const unlock = () => {
      video.muted = false;
      play();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, [mediaUrl, config.mediaKind, config.mediaSound, config.mediaVolume]);

  if (!hasBackdrop) return null;

  const background = config.gradient
    ? `linear-gradient(${config.gradientAngle}deg, ${config.gradientFrom}, ${config.gradientTo})`
    : config.background;

  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background,
        overflow: 'hidden',
      }}
    >
      {mediaUrl && config.mediaKind === 'image' && (
        <img
          src={mediaUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {mediaUrl && config.mediaKind === 'video' && (
        <video
          ref={videoRef}
          src={mediaUrl}
          loop
          playsInline
          autoPlay
          muted={!config.mediaSound}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
    </div>,
    document.body
  );
}
