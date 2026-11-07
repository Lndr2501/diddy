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
 * Limits (Element Call keeps control of the layout): the shares stay inside the spotlight area,
 * they are not mixed into the camera grid; Element Call's volume button for screen-share audio
 * still acts on the share it thinks is "visible" (the first one).
 */

const STYLE_ATTR = 'data-diddy-screen-share-grid';

const TILE = '[data-testid="videoTile"]';
/** A media tile that is an item of the spotlight carousel (grid tiles have no `_item_` class). */
const ITEM = `${TILE}[class*="_item_"]`;
const CONTENTS = '[class*="_contents_"]';
/** The spotlight carousel, only while it holds two or more media tiles. */
const CAROUSEL = `${CONTENTS}:has(> ${ITEM} ~ ${ITEM})`;
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

/* --- nothing to page through any more: no arrows, no indicator dashes --- */
html body ${SPOTLIGHT} > [class*="_advance_"],
html body ${SPOTLIGHT} > [class*="_indicators_"] {
  display: none !important;
}
`;

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
  } catch {
    // cross-origin or torn-down iframe: Element Call keeps its carousel
  }
}
