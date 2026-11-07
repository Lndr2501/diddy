import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Icon, IconButton, Icons, Spinner, Text } from 'folds';
import { DOCK_DEFAULT_HEIGHT, PluginStyle } from '../../state/pluginDock';
import {
  createInitMessage,
  DEFAULT_FRAME_HEIGHT,
  parsePluginMessage,
  PluginManifest,
  PluginTheme,
  UserPlugin,
} from '../../plugins/userPlugins';
import { ThemeKind, useTheme } from '../../hooks/useTheme';
import { BreakWord } from '../../styles/Text.css';
import * as css from './PluginFrame.css';

/** How long a page may take to say 'diddy:ready' before we tell the user it does not answer. */
const READY_TIMEOUT = 10000;

/**
 * Powerful features are never delegated to a plugin. Cross-origin frames do not get most of them
 * by default anyway; listing them keeps that explicit.
 */
const DENIED_FEATURES = [
  'camera',
  'microphone',
  'geolocation',
  'display-capture',
  'clipboard-read',
  'clipboard-write',
  'payment',
  'usb',
  'fullscreen',
]
  .map((feature) => `${feature} 'none'`)
  .join('; ');

const browserLocale = (): string | undefined => {
  try {
    return navigator.language;
  } catch {
    return undefined;
  }
};

type PluginFrameProps = {
  plugin: UserPlugin;
  /** small sidebar card: no frame, no status row, capped height */
  compact?: boolean;
  /** the user's look for this plugin: sidebar height and zoom, custom CSS */
  look?: PluginStyle;
};
/**
 * One user plugin, live. The page runs in an iframe with `sandbox="allow-scripts"` only: it gets
 * an opaque origin, so it cannot read the app's storage, cookies or Matrix session, cannot
 * navigate the app, open popups or submit forms. The only channel is postMessage, and every
 * message is checked to come from exactly this frame and to have one of the known shapes.
 */
export function PluginFrame({ plugin, compact, look }: PluginFrameProps) {
  const layout = compact ? 'compact' : 'full';
  const layoutRef = useRef<'full' | 'compact'>(layout);
  layoutRef.current = layout;
  const cssRef = useRef<string | undefined>(look?.css);
  cssRef.current = look?.css;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const theme = useTheme();
  const themeKind: PluginTheme = theme.kind === ThemeKind.Light ? 'light' : 'dark';
  const themeRef = useRef(themeKind);
  themeRef.current = themeKind;
  const sentThemeRef = useRef<PluginTheme>();

  const [loadKey, setLoadKey] = useState(0);
  const [height, setHeight] = useState(DEFAULT_FRAME_HEIGHT);
  const [ready, setReady] = useState(false);
  const [silent, setSilent] = useState(false);
  const [manifest, setManifest] = useState<PluginManifest>();

  const postInit = useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    sentThemeRef.current = themeRef.current;
    // The sandboxed page has an opaque origin, so '*' is the only target that reaches it.
    // That is fine: the init message holds nothing private (API version, theme, locale).
    target.postMessage(
      createInitMessage(themeRef.current, browserLocale(), layoutRef.current, cssRef.current),
      '*'
    );
  }, []);

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || evt.source !== frameWindow) return;
      const message = parsePluginMessage(evt.data);
      if (!message) return;
      if (message.type === 'diddy:ready') {
        setReady(true);
        setSilent(false);
        setManifest(message.manifest);
        if (message.manifest?.height !== undefined) setHeight(message.manifest.height);
        postInit();
        return;
      }
      setHeight(message.height);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [postInit]);

  // a running plugin learns about theme changes through a fresh 'diddy:init'
  useEffect(() => {
    if (ready && sentThemeRef.current !== themeKind) postInit();
  }, [ready, themeKind, postInit]);

  // and about a change between the big and the small card
  useEffect(() => {
    if (ready) postInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, look?.css]);

  // reset whenever the page is (re)loaded and warn if it never answers
  useEffect(() => {
    setReady(false);
    setSilent(false);
    setManifest(undefined);
    setHeight(DEFAULT_FRAME_HEIGHT);
    sentThemeRef.current = undefined;
    const timer = window.setTimeout(() => setSilent(true), READY_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [plugin.url, loadKey]);

  // sidebar card: capped at the user's height; the page itself scrolls inside
  const zoom = compact ? (look?.zoom ?? 100) / 100 : 1;
  const shownHeight = compact ? Math.min(height, look?.height ?? DOCK_DEFAULT_HEIGHT) : height;

  let status: string | undefined = manifest?.description;
  if (!ready) {
    status = silent
      ? 'This page does not talk to Diddy. It is shown as a plain page.'
      : 'Loading plugin…';
  }

  return (
    <div className={css.Root}>
      <div
        className={compact ? css.FrameBoxCompact : css.FrameBox}
        style={compact ? { height: `${shownHeight * zoom}px` } : undefined}
      >
        <iframe
          key={`${plugin.url}#${loadKey}`}
          ref={frameRef}
          className={css.Frame}
          style={{
            height: `${shownHeight}px`,
            colorScheme: themeKind,
            ...(compact && zoom < 1
              ? { width: `${100 / zoom}%`, transform: `scale(${zoom})`, transformOrigin: '0 0' }
              : {}),
          }}
          title={plugin.name}
          src={plugin.url}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allow={DENIED_FEATURES}
          loading="lazy"
        />
      </div>
      {(!compact || !ready) && (
        <div className={css.Status}>
          {!ready && !silent && <Spinner variant="Secondary" size="100" />}
          <Box grow="Yes" style={{ minWidth: 0 }}>
            {status && (
              <Text size="T200" className={`${css.StatusText} ${BreakWord}`}>
                {status}
              </Text>
            )}
          </Box>
          <IconButton
            size="300"
            radii="300"
            variant="Surface"
            aria-label={`Reload ${plugin.name}`}
            title="Reload"
            onClick={() => setLoadKey((key) => key + 1)}
          >
            <Icon src={Icons.Reload} size="100" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
