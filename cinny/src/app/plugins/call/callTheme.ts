/**
 * Restyles the Element Call web app (same-origin iframe) so its participant tiles match the
 * Diddy look (#21, Apple style): rounded translucent cards with a hairline, round avatar, name tag
 * as a frosted material pill, a speaking ring in the Diddy accent colour (read from the app theme)
 * and a transparent page background so the app backdrop shows through.
 *
 * Element Call ships hashed CSS-module class names (`_tile_ghafa_8`). To survive rebuilds we
 * prefer stable hooks and only use attribute-substring selectors (`[class*="_speaking_"]`) where
 * nothing stable exists. Stable hooks used:
 *   - [data-testid="videoTile"]  : the tile (MediaView root, also carries the speaking class)
 *   - [data-testid="name_tag"]   : the display name text inside the name pill
 *   - [data-muted="true"]        : the mute icon in the name pill
 *   - body.cpd-theme-light/dark  : theme class set by Element Call from the `theme` URL param
 *   - tile structure             : first child div = background/avatar layer, second = overlay
 * Class substring selectors used: _speaking_, _nameTag_, _status_, _translucent_, _avatar_,
 * _edgeToEdge_.
 *
 * Every rule is purely cosmetic: nothing is hidden, no display/size/position of the layout is
 * changed, so if a selector stops matching the call simply looks like stock Element Call.
 * The call footer/controls (which CallControl.ts drives programmatically) are not touched.
 */

import { color } from 'folds';

const STYLE_ATTR = 'data-diddy-call-theme';
const OBSERVER_ATTR = 'data-diddy-call-theme-observer';

const TILE = '[data-testid="videoTile"]';
const TILE_ROUNDED = `html body ${TILE}:not([class*="_edgeToEdge_"])`;

const CALL_THEME_CSS = `
/* --- theme tokens (dark default, light override) --- */
body {
  --diddy-tile-bg: rgba(38, 34, 42, 0.72);
  --diddy-tile-line: rgba(255, 255, 255, 0.08);
  --diddy-tile-shadow: 0 1px 2px rgba(0, 0, 0, 0.18), 0 8px 24px rgba(0, 0, 0, 0.22);
  --diddy-tag-bg: rgba(22, 20, 26, 0.55);
  --diddy-tag-fg: #ffffff;
  --diddy-status-fg: rgba(255, 255, 255, 0.86);
  --diddy-avatar-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  /* overwritten inline with the app's accent colour (syncAccent), this is only the fallback */
  --diddy-speaking: #e5517c;
  --diddy-muted: #ff6b81;
  /* menus; overwritten inline with the app's menu material (syncAccent) */
  --diddy-menu-bg: rgba(51, 51, 51, 0.82);
  --diddy-menu-fg: #f2f2f2;
  --diddy-menu-line: rgba(255, 255, 255, 0.08);
  --diddy-menu-hover: rgba(255, 255, 255, 0.06);
  --diddy-menu-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.28),
    0 12px 32px rgba(0, 0, 0, 0.36);
}
body[class*="cpd-theme-light"] {
  --diddy-tile-bg: rgba(255, 255, 255, 0.7);
  --diddy-tile-line: rgba(0, 0, 0, 0.08);
  --diddy-tile-shadow: 0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 24px rgba(0, 0, 0, 0.08);
  --diddy-tag-bg: rgba(255, 255, 255, 0.72);
  --diddy-tag-fg: #1b1d22;
  --diddy-status-fg: rgba(27, 29, 34, 0.82);
  --diddy-avatar-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  --diddy-muted: #d1304a;
}

/* --- transparent page so the app backdrop shows through --- */
html, html body, html body #root {
  background: transparent !important;
  background-image: none !important;
}
/* the (programmatically driven) footer must never paint an opaque gradient */
html body [data-testid="footer-container"] {
  background: none !important;
}

/* --- tile --- */
${TILE} {
  --video-tile-background: var(--diddy-tile-bg);
}
/* beats Element Call's hover / speaking / hand-raised outlines (they are !important too) */
html body ${TILE}[class] {
  outline: 0 !important;
}
${TILE_ROUNDED} {
  --media-view-border-radius: 18px;
  --media-view-fg-inset: 10px;
  border-radius: 18px;
  box-shadow: var(--diddy-tile-shadow);
  transition: box-shadow 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
${TILE} > div:first-child {
  background-color: var(--diddy-tile-bg);
  box-shadow: inset 0 0 0 1px var(--diddy-tile-line);
}

/* --- avatar: centered (already by Element Call), round, soft shadow --- */
${TILE} > div:first-child [class*="_avatar_"] {
  --cpd-avatar-radius: 50%;
  border-radius: 50% !important;
  overflow: hidden;
  box-shadow: 0 0 0 1px var(--diddy-tile-line), var(--diddy-avatar-shadow);
}
${TILE} > div:first-child [class*="_translucent_"] {
  mix-blend-mode: normal;
}

/* --- speaking: 2px accent ring (inset on the layer so it follows the radius) + soft glow --- */
/* same specificity as TILE_ROUNDED and later, so it wins over the resting tile shadow */
html body ${TILE}[class*="_speaking_"] {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--diddy-speaking) 35%, transparent),
    0 0 24px color-mix(in srgb, var(--diddy-speaking) 28%, transparent);
}
${TILE}[class*="_speaking_"] > div:first-child {
  box-shadow: inset 0 0 0 2px var(--diddy-speaking);
}
/* drop Element Call's blue/teal speaking glow in favour of the ring */
${TILE}[class*="_speaking_"]::before {
  opacity: 0 !important;
  background: none !important;
}

/* --- name tag (bottom-left): frosted material pill --- */
${TILE} [class*="_nameTag_"] {
  background-color: var(--diddy-tag-bg);
  color: var(--diddy-tag-fg);
  border: 1px solid var(--diddy-tile-line);
  border-radius: 999px;
  padding: 3px 10px 3px 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}
${TILE} :has(> [data-testid="name_tag"]) {
  color: var(--diddy-tag-fg);
}
${TILE} [data-testid="name_tag"] {
  color: var(--diddy-tag-fg);
  padding-inline: 6px 2px;
  font-size: 12px;
  font-weight: 500;
}
${TILE} [data-muted="true"] {
  color: var(--diddy-muted) !important;
}
${TILE} [data-muted="false"] {
  color: var(--diddy-tag-fg) !important;
}

/* --- "Waiting for media..." / status text: readable --- */
${TILE} [class*="_status_"] {
  color: var(--diddy-status-fg);
  font-size: 13px;
  font-weight: 500;
}
${TILE} [class*="_status_"] svg {
  color: var(--diddy-status-fg);
}

/* --- "..." tile menu: always faintly visible, round --- */
${TILE} > div:nth-child(2) > button:first-of-type {
  background: transparent;
  box-shadow: none;
  opacity: 0.75;
  border-radius: 50%;
  transition: opacity 160ms ease-out, background-color 160ms ease-out;
}
${TILE} > div:nth-child(2) > button:first-of-type:hover {
  background: var(--diddy-tag-bg);
  opacity: 1;
}
${TILE} > div:nth-child(2) > button:first-of-type > svg {
  color: var(--diddy-tag-fg);
}

/* --- Element Call's own menus (a tile's "mute for me" / volume menu): the same material,
   radius, header and rows as Diddy's menus in the app window (CallUserMenu). The colours come
   from the app theme (syncAccent); the --cpd-* tokens retint the switch and the slider. --- */
html body [role="menu"][class*="_menu_"] {
  --cpd-separator-inset: 0;
  --cpd-color-bg-canvas-default: transparent;
  --cpd-color-bg-accent-rest: var(--diddy-speaking);
  --cpd-color-bg-accent-hovered: var(--diddy-speaking);
  --cpd-color-bg-action-primary-rest: var(--diddy-speaking);
  --cpd-color-bg-action-primary-hovered: var(--diddy-speaking);
  --cpd-color-bg-subtle-primary: var(--diddy-menu-hover);
  --cpd-color-border-interactive-primary: var(--diddy-menu-line);
  --cpd-color-border-interactive-secondary: var(--diddy-menu-line);
  --cpd-color-text-primary: var(--diddy-menu-fg);
  --cpd-color-text-secondary: var(--diddy-menu-fg);
  --cpd-color-icon-primary: var(--diddy-menu-fg);
  --cpd-color-icon-secondary: var(--diddy-menu-fg);
  --cpd-color-separator-primary: var(--diddy-menu-line);
  --cpd-color-separator-secondary: var(--diddy-menu-line);
  min-inline-size: 220px;
  padding: 4px !important;
  gap: 2px;
  border-radius: 12px;
  border: 1px solid var(--diddy-menu-line);
  outline: 0 !important;
  background: var(--diddy-menu-bg) !important;
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: var(--diddy-menu-shadow) !important;
  color: var(--diddy-menu-fg);
}
/* header: the person's name, bold, a hairline below (like the app menu) */
html body [role="menu"][class*="_menu_"] > h3,
html body [role="menu"][class*="_menu_"] > [class*="_title_"] {
  margin: 0 !important;
  padding: 4px 8px 8px !important;
  border-bottom: 1px solid var(--diddy-menu-line);
  margin-bottom: 2px !important;
  font-size: 12px !important;
  line-height: 16px !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  color: var(--diddy-menu-fg) !important;
}
html body [role="menu"][class*="_menu_"] [class*="_item_"] {
  min-inline-size: 0;
  min-block-size: 32px;
  padding-block: 6px;
  padding-inline: 8px;
  border-radius: 8px;
  background: transparent !important;
  color: var(--diddy-menu-fg);
  transition: background-color 120ms ease, color 120ms ease;
}
html body [role="menu"][class*="_menu_"] [class*="_item_"] [class*="_label_"] {
  font-size: 14px !important;
  font-weight: 400 !important;
  letter-spacing: 0 !important;
  color: inherit !important;
}
html body [role="menu"][class*="_menu_"] [class*="_item_"] svg {
  inline-size: 18px;
  block-size: 18px;
  color: inherit;
  opacity: 0.85;
}
/* hover: a quiet fill. These rows hold a switch, which would vanish in an accent fill; the volume
   row only holds a slider, so no fill there */
html body [role="menu"][class*="_menu_"] [class*="_item_"]:not([class*="_volumeMenuItem_"]):hover,
html body [role="menu"][class*="_menu_"] [class*="_item_"]:not([class*="_volumeMenuItem_"]):focus-visible {
  background: var(--diddy-menu-hover) !important;
}
html body [role="menu"][class*="_menu_"] [class*="_separator_"] {
  margin-block: 2px;
}
html body [role="menu"][class*="_menu_"] [class*="_handle_"] {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  ${TILE_ROUNDED}, ${TILE} > div:nth-child(2) > button:first-of-type {
    transition: none;
  }
}
`;

const themeKind = (doc: Document): 'light' | 'dark' =>
  doc.body?.classList.contains('cpd-theme-light') ||
  doc.body?.classList.contains('cpd-theme-light-hc')
    ? 'light'
    : 'dark';

/**
 * An iframe whose document color-scheme differs from the iframe element's color-scheme gets an
 * opaque canvas, which would defeat the transparent background. Keep both in sync.
 */
const syncColorScheme = (win: Window, doc: Document) => {
  const kind = themeKind(doc);
  doc.documentElement.style.setProperty('color-scheme', kind);
  const frame = win.frameElement as HTMLElement | null;
  frame?.style.setProperty('color-scheme', kind);
};

/** Name of the CSS variable behind a folds colour token (`var(--abc)` -> `--abc`). */
const varName = (token: string): string | undefined => /var\((--[^,)\s]+)/.exec(token)?.[1];

/**
 * App variables copied into the call page, as `[app variable, call page variable]`. Custom
 * properties resolve their var() references when computed, so `--diddy-material` arrives as a
 * plain colour-mix of the active theme.
 */
const SYNCED_VARS: [string | undefined, string][] = [
  [varName(color.Primary.Main), '--diddy-speaking'],
  [varName(color.Surface.OnContainer), '--diddy-menu-fg'],
  ['--diddy-material', '--diddy-menu-bg'],
  ['--diddy-rim', '--diddy-menu-line'],
  ['--diddy-hover', '--diddy-menu-hover'],
  ['--diddy-shadow-2', '--diddy-menu-shadow'],
];

/**
 * The speaking ring and Element Call's menus use the colours of the current app theme. The
 * iframe cannot see the app's CSS variables, so the resolved values are copied onto its body
 * (re-run on theme changes).
 */
const syncAccent = (win: Window, doc: Document) => {
  const appBody = (win.frameElement as HTMLElement | null)?.ownerDocument?.body;
  if (!appBody || !doc.body) return;
  const computed = getComputedStyle(appBody);
  SYNCED_VARS.forEach(([from, to]) => {
    if (!from) return;
    const value = computed.getPropertyValue(from).trim();
    if (value) doc.body.style.setProperty(to, value);
  });
};

/**
 * Inject the Diddy call theme into an Element Call iframe window. Safe to call repeatedly
 * (idempotent), safe with a null/cross-origin/not-yet-ready window (does nothing).
 */
export function installCallTheme(win: Window | null | undefined): void {
  try {
    const doc = win?.document;
    if (!win || !doc) return;
    const parent = doc.head ?? doc.documentElement;
    if (!parent) return;

    if (!doc.querySelector(`style[${STYLE_ATTR}]`)) {
      const style = doc.createElement('style');
      style.setAttribute(STYLE_ATTR, 'true');
      style.textContent = CALL_THEME_CSS;
      parent.appendChild(style);
    }

    if (doc.body) {
      syncColorScheme(win, doc);
      syncAccent(win, doc);
      if (!doc.documentElement.hasAttribute(OBSERVER_ATTR)) {
        doc.documentElement.setAttribute(OBSERVER_ATTR, 'true');
        // Element Call switches the body theme class on the `theme` param / ThemeChange action.
        new MutationObserver(() => {
          syncColorScheme(win, doc);
          syncAccent(win, doc);
        }).observe(doc.body, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    }
  } catch {
    // cross-origin or torn-down iframe: leave Element Call unthemed
  }
}
