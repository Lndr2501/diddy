/**
 * Shows every screen share of a call at once (issue #66) instead of one at a time.
 *
 * Who is where is decided by Element Call inside the (same-origin) iframe, not by Diddy: as soon as
 * somebody shares, Element Call puts all screen shares into one "spotlight" tile and keeps every
 * participant's camera tile (or profile picture, camera off) in the normal grid next to it. Inside
 * the spotlight the shares sit in a horizontal scroll-snap carousel, one visible at a time, with
 * arrows and indicator dashes to switch. That carousel is what #66 is about.
 *
 * Every share is already rendered as its own media tile with the sharer's name tag at the bottom
 * (Element Call's MediaView, `data-testid="videoTile"`); only the carousel hides all but one. This
 * stylesheet turns the carousel into a grid when it holds two or more shares, so all of them are
 * visible side by side, each with its name. The camera tiles are untouched. Because the hidden
 * shares become visible, LiveKit's adaptive stream also stops pausing them.
 *
 * Element Call ships hashed CSS-module names (`_contents_sv5x1_8`), so like callTheme.ts this uses
 * stable hooks plus class substrings, and only matches a container whose direct children are two
 * or more media tiles that are carousel items. If a selector stops matching after an Element Call
 * update, the call simply falls back to the stock carousel.
 *
 * Switching (issue #2, viewer side): a click on one of the shares focuses it - it takes the large
 * area, the other shares shrink to a row of thumbnails below it. A click on the focused share,
 * or Escape, goes back to the side-by-side grid; a click on a thumbnail switches to that share.
 * Each viewer chooses on their own (it is local DOM state), and adaptive stream fetches the large
 * layer only for the focused share. The focus lives as an attribute on Element Call's tile: if
 * Element Call re-creates the tile, or that share ends, the view falls back to the grid.
 *
 * Limits (Element Call keeps control of the layout): the shares stay inside the spotlight area,
 * they are not mixed into the camera grid; Element Call's volume button for screen-share audio
 * still acts on the share it thinks is "visible" (the first one).
 */

const STYLE_ATTR = 'data-diddy-screen-share-grid';
/** Set on the share a viewer focused (issue #2). */
export const FOCUS_ATTR = 'data-diddy-share-focus';

const TILE = '[data-testid="videoTile"]';
/** A media tile that is an item of the spotlight carousel (grid tiles have no `_item_` class). */
const ITEM = `${TILE}[class*="_item_"]`;
const CONTENTS = '[class*="_contents_"]';
/** The spotlight carousel, only while it holds two or more media tiles. */
const CAROUSEL = `${CONTENTS}:has(> ${ITEM} ~ ${ITEM})`;
/** Such a carousel while one of its shares is focused. */
const FOCUSED = `${CAROUSEL}:has(> ${ITEM}[${FOCUS_ATTR}])`;
/** The spotlight tile around such a carousel (spelled out: `:has()` must not be nested). */
const SPOTLIGHT = `[class*="_tile_"]:has(> ${CONTENTS} > ${ITEM} ~ ${ITEM})`;

export const SCREEN_SHARE_GRID_CSS = `
/* --- carousel -> grid: all screen shares visible at once --- */
html body ${CAROUSEL} {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 8px;
  overflow: hidden !important;
  scroll-snap-type: none !important;
  contain: strict;
}
/* 5 to 9 shares: 3 columns, 10 and more: 4 columns */
html body ${CAROUSEL}:has(> ${ITEM}:nth-child(5)) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
html body ${CAROUSEL}:has(> ${ITEM}:nth-child(10)) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
/* 3 shares: the third spans the bottom row instead of leaving a hole */
html body ${CAROUSEL}:has(> ${ITEM}:nth-child(3)):not(:has(> ${ITEM}:nth-child(4))) > ${ITEM}:nth-child(3) {
  grid-column: 1 / -1;
}
html body ${CAROUSEL} > ${ITEM} {
  flex: none;
  inline-size: auto;
  block-size: auto;
  min-inline-size: 0;
  min-block-size: 0;
  scroll-snap-align: none;
}

/* --- one share focused: it takes the large area, the others become thumbnails below --- */
html body ${CAROUSEL} > ${ITEM} {
  cursor: zoom-in;
}
html body ${FOCUSED} {
  display: flex !important;
  flex-wrap: wrap;
  align-content: stretch;
  justify-content: center;
}
html body ${FOCUSED} > ${ITEM} {
  flex: 1 1 0;
  max-inline-size: 25%;
  block-size: calc(22% - 8px);
  cursor: pointer;
}
html body ${FOCUSED} > ${ITEM}[${FOCUS_ATTR}] {
  order: -1;
  flex: 0 0 100%;
  max-inline-size: none;
  block-size: 78%;
  cursor: zoom-out;
}

/* --- nothing to page through any more: no arrows, no indicator dashes --- */
html body ${SPOTLIGHT} > [class*="_advance_"],
html body ${SPOTLIGHT} > [class*="_indicators_"] {
  display: none !important;
}
`;

/** Clicks on these stay Element Call's (volume, menus, buttons inside a tile). */
const CONTROLS =
  'button, a, input, select, textarea, [role="button"], [role="menu"], [role="slider"]';

/**
 * Handles a click inside the call (issue #2): on a share of a carousel that holds two or more
 * shares it focuses that share, or unfocuses it when it already is. Returns true when it did.
 */
export function toggleShareFocus(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.closest(CONTROLS)) return false;
  const tile = el.closest(ITEM);
  const carousel = tile?.parentElement;
  if (!tile || !carousel || !carousel.matches(CONTENTS)) return false;
  const items = Array.from(carousel.children).filter((child) => child.matches(ITEM));
  if (items.length < 2) return false;
  const wasFocused = tile.hasAttribute(FOCUS_ATTR);
  items.forEach((item) => item.removeAttribute(FOCUS_ATTR));
  if (!wasFocused) tile.setAttribute(FOCUS_ATTR, 'true');
  return true;
}

/** Back to the side-by-side grid. Returns true when a share was focused. */
export function clearShareFocus(doc: Document): boolean {
  const focused = Array.from(doc.querySelectorAll(`[${FOCUS_ATTR}]`));
  focused.forEach((item) => item.removeAttribute(FOCUS_ATTR));
  return focused.length > 0;
}

/** A press that moved this far is a drag (the floating spotlight can be dragged), not a click. */
const DRAG_PX = 6;

const installFocusSwitching = (doc: Document) => {
  let down: { x: number; y: number } | undefined;
  doc.addEventListener(
    'pointerdown',
    (evt) => {
      down = { x: evt.clientX, y: evt.clientY };
    },
    true
  );
  doc.addEventListener('click', (evt) => {
    const start = down;
    down = undefined;
    if (evt.button !== 0) return;
    if (start && Math.hypot(evt.clientX - start.x, evt.clientY - start.y) > DRAG_PX) return;
    toggleShareFocus(evt.target);
  });
  doc.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && clearShareFocus(doc)) evt.stopPropagation();
  });
};

/**
 * Inject the screen-share grid into an Element Call iframe window. Idempotent; does nothing for a
 * null, cross-origin or not-yet-ready window.
 */
export function installScreenShareGrid(win: Window | null | undefined): void {
  try {
    const doc = win?.document;
    const parent = doc?.head ?? doc?.documentElement;
    if (!doc || !parent) return;
    if (doc.querySelector(`style[${STYLE_ATTR}]`)) return;
    const style = doc.createElement('style');
    style.setAttribute(STYLE_ATTR, 'true');
    style.textContent = SCREEN_SHARE_GRID_CSS;
    parent.appendChild(style);
    installFocusSwitching(doc);
  } catch {
    // cross-origin or torn-down iframe: Element Call keeps its carousel
  }
}
