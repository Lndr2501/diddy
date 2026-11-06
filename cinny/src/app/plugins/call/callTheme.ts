/**
 * Restyles the Element Call web app (same-origin iframe) so its participant tiles match the
 * Diddy look: rounded dark translucent cards, round avatar, name pill, green speaking ring and a
 * transparent page background so the app backdrop shows through.
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

const STYLE_ATTR = 'data-diddy-call-theme';
const OBSERVER_ATTR = 'data-diddy-call-theme-observer';

const TILE = '[data-testid="videoTile"]';
const TILE_ROUNDED = `html body ${TILE}:not([class*="_edgeToEdge_"])`;

const CALL_THEME_CSS = `
/* --- theme tokens (dark default, light override) --- */
body {
  --diddy-tile-bg: rgba(35, 39, 42, 0.78);
  --diddy-tile-line: rgba(255, 255, 255, 0.07);
  --diddy-tag-bg: rgba(16, 18, 20, 0.62);
  --diddy-tag-fg: #ffffff;
  --diddy-status-fg: rgba(255, 255, 255, 0.88);
  --diddy-avatar-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  --diddy-speaking: #3ddc84;
  --diddy-muted: #ff6b81;
}
body[class*="cpd-theme-light"] {
  --diddy-tile-bg: rgba(255, 255, 255, 0.72);
  --diddy-tile-line: rgba(0, 0, 0, 0.08);
  --diddy-tag-bg: rgba(255, 255, 255, 0.82);
  --diddy-tag-fg: #1b1d22;
  --diddy-status-fg: rgba(27, 29, 34, 0.85);
  --diddy-avatar-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
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
  --media-view-fg-inset: 12px;
  border-radius: 18px;
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

/* --- speaking: green 3px ring (inset on the layer so it follows the radius) --- */
${TILE}[class*="_speaking_"] {
  box-shadow: 0 0 22px rgba(61, 220, 132, 0.22);
}
${TILE}[class*="_speaking_"] > div:first-child {
  box-shadow: inset 0 0 0 3px var(--diddy-speaking);
}
/* drop Element Call's blue/teal speaking glow in favour of the ring */
${TILE}[class*="_speaking_"]::before {
  opacity: 0 !important;
  background: none !important;
}

/* --- name pill (bottom-left) --- */
${TILE} [class*="_nameTag_"] {
  background-color: var(--diddy-tag-bg);
  color: var(--diddy-tag-fg);
  border: 1px solid var(--diddy-tile-line);
  border-radius: 999px;
  padding: 4px 10px 4px 8px;
  box-shadow: none;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
${TILE} :has(> [data-testid="name_tag"]) {
  color: var(--diddy-tag-fg);
}
${TILE} [data-testid="name_tag"] {
  color: var(--diddy-tag-fg);
  padding-inline: 6px 2px;
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
  font-size: 0.95rem;
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
}
${TILE} > div:nth-child(2) > button:first-of-type:hover {
  background: var(--diddy-tag-bg);
  opacity: 1;
}
${TILE} > div:nth-child(2) > button:first-of-type > svg {
  color: var(--diddy-tag-fg);
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
      if (!doc.documentElement.hasAttribute(OBSERVER_ATTR)) {
        doc.documentElement.setAttribute(OBSERVER_ATTR, 'true');
        // Element Call switches the body theme class on the `theme` param / ThemeChange action.
        new MutationObserver(() => syncColorScheme(win, doc)).observe(doc.body, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    }
  } catch {
    // cross-origin or torn-down iframe: leave Element Call unthemed
  }
}
