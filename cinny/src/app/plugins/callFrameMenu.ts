/**
 * Right-click inside the embedded call (Element Call): Diddy's message menu does not exist there,
 * and the web view's own menu is switched off (Reload, Inspect ...). The text under the pointer
 * (or the selection) is handed to the app, which shows a small Copy menu in the main window; a
 * menu injected into the call page itself was never visible.
 *
 * While the call runs in another room the call view stays where it was, only hidden
 * (visibility: hidden, pointer-events: none), so the media keep running. WKWebView still delivers
 * right-clicks over that area to the call document instead of the chat behind it, so there the
 * right-click is passed on to the element of the main window under the pointer.
 */

const MAX_COPY = 4000;
export const CALL_FRAME_MENU_EVENT = 'diddy-call-frame-menu';

export type CallFrameMenuDetail = { x: number; y: number; text: string };

/** Right-click on a person (a tile in the call, or their avatar elsewhere): the Discord-style menu. */
export const CALL_USER_MENU_EVENT = 'diddy-call-user-menu';
export type CallUserMenuDetail = { x: number; y: number; userId: string };

/** A participant tile of the embedded call (Element Call's `MediaView`). */
export const CALL_TILE_SELECTOR = '[data-testid="videoTile"]';

type LabelledLike = { getAttribute: (name: string) => string | null };
type TileLike = { querySelector: (selector: string) => LabelledLike | null };

/** The Matrix ID of the tile's owner: the first `aria-label` in a tile is the avatar's (the ID). */
export const tileUserId = (tile: TileLike | null | undefined): string | undefined => {
  const label = tile?.querySelector('[aria-label]')?.getAttribute('aria-label');
  return label && /^@[^\s:]+:[^\s]+$/.test(label) ? label : undefined;
};

/** The tile of `userId` in the call document, if that person is shown. */
export const findCallTile = <T extends TileLike>(
  doc: { querySelectorAll: (selector: string) => ArrayLike<T> } | null | undefined,
  userId: string
): T | undefined => {
  if (!doc) return undefined;
  return Array.from(doc.querySelectorAll(CALL_TILE_SELECTOR)).find(
    (tile) => tileUserId(tile) === userId
  );
};

type MutedTileLike = TileLike & { querySelector: (selector: string) => LabelledLike | null };

/**
 * Who shows the mute icon in the call document (Element Call sets `data-muted="true"` on the icon
 * in a tile's name tag: the person muted themselves, or you muted them for yourself). Only people
 * whose tile is shown are known, and only while you are in that call.
 */
export const mutedCallUsers = (
  doc: { querySelectorAll: (selector: string) => ArrayLike<MutedTileLike> } | null | undefined
): Set<string> => {
  const muted = new Set<string>();
  if (!doc) return muted;
  Array.from(doc.querySelectorAll(CALL_TILE_SELECTOR)).forEach((tile) => {
    const userId = tileUserId(tile);
    if (userId && tile.querySelector('[data-muted="true"]')) muted.add(userId);
  });
  return muted;
};

/** Ask the main window to show the person menu at (x, y) for `userId`. */
export const openCallUserMenu = (userId: string, x: number, y: number): void => {
  window.dispatchEvent(
    new CustomEvent<CallUserMenuDetail>(CALL_USER_MENU_EVENT, { detail: { x, y, userId } })
  );
};

type FrameStyleLike = { visibility?: string; pointerEvents?: string } | null | undefined;

/** True when the call view is hidden (another room), so a right-click on it is meant for the chat. */
export const isCallFrameHidden = (iframeStyle: FrameStyleLike): boolean =>
  !!iframeStyle &&
  (iframeStyle.visibility === 'hidden' ||
    iframeStyle.visibility === 'collapse' ||
    iframeStyle.pointerEvents === 'none');

type FrameMouseEventLike = {
  clientX: number;
  clientY: number;
  screenX?: number;
  screenY?: number;
  buttons?: number;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

/** The event init for the main window: frame coordinates moved by the frame's position. */
export const forwardedContextMenuInit = (
  box: { left: number; top: number },
  evt: FrameMouseEventLike
): MouseEventInit => ({
  bubbles: true,
  cancelable: true,
  composed: true,
  clientX: box.left + evt.clientX,
  clientY: box.top + evt.clientY,
  screenX: evt.screenX ?? 0,
  screenY: evt.screenY ?? 0,
  button: 2,
  buttons: evt.buttons ?? 2,
  ctrlKey: !!evt.ctrlKey,
  shiftKey: !!evt.shiftKey,
  metaKey: !!evt.metaKey,
  altKey: false,
});

type HitElement = {
  closest?: (selector: string) => unknown;
  dispatchEvent: (evt: unknown) => boolean;
};
type HitDocument = {
  elementFromPoint?: (x: number, y: number) => unknown;
  elementsFromPoint?: (x: number, y: number) => unknown[];
};

const inCallView = (el: HitElement): boolean =>
  typeof el.closest === 'function' && !!el.closest('[data-call-embed-container]');

/** The topmost element of the main window at (x, y) that is not part of the call view. */
export const elementBehindCallView = (
  doc: HitDocument,
  x: number,
  y: number
): HitElement | null => {
  const candidates =
    typeof doc.elementsFromPoint === 'function'
      ? doc.elementsFromPoint(x, y)
      : [doc.elementFromPoint?.(x, y)];
  const hit = (candidates as (HitElement | null | undefined)[]).find(
    (el) => !!el && typeof el.dispatchEvent === 'function' && !inCallView(el)
  );
  return hit ?? null;
};

/**
 * Hand a right-click on the hidden call view to the main window: a contextmenu event at the same
 * spot on the element under the pointer, which React's handlers (the message menu) receive like a
 * real one. Returns the element and whether a handler took it.
 */
export const forwardContextMenu = <E>(
  doc: HitDocument,
  init: MouseEventInit,
  makeEvent: (init: MouseEventInit) => E & { defaultPrevented: boolean }
): { target: HitElement | null; handled: boolean } => {
  const target = elementBehindCallView(doc, init.clientX ?? 0, init.clientY ?? 0);
  if (!target) return { target, handled: false };
  const evt = makeEvent(init);
  target.dispatchEvent(evt);
  return { target, handled: evt.defaultPrevented };
};

const textToCopy = (doc: Document, target: EventTarget | null): string => {
  const selected = doc.defaultView?.getSelection?.()?.toString().trim();
  if (selected) return selected.slice(0, MAX_COPY);
  let node = target as HTMLElement | null;
  // the closest element that holds some text of its own, not the whole page
  while (node && node !== doc.body) {
    const text = node.innerText?.trim();
    if (text && text.length <= MAX_COPY && node.childElementCount <= 6) return text;
    node = node.parentElement;
  }
  return '';
};

/** True while `openCallTileMenu` dispatches its right-click, so the capture handler lets it pass. */
let openingTileMenu = false;

export const installCallFrameMenu = (
  doc: Document | null | undefined,
  iframe: HTMLIFrameElement
): void => {
  if (!doc || !doc.body) return;
  const marked = doc as Document & { __diddyFrameMenu?: boolean };
  if (marked.__diddyFrameMenu) return;
  marked.__diddyFrameMenu = true;

  // A person's tile: the person menu (profile, message, volume ...). Element Call opens its own
  // menu from the same event, so this runs in the capture phase and keeps the event from it;
  // "Volume & Mute for me" asks for that menu again with `openCallTileMenu`.
  doc.addEventListener(
    'contextmenu',
    (evt) => {
      if (openingTileMenu || evt.altKey) return;
      if (isCallFrameHidden(getComputedStyle(iframe))) return;
      const tile = (evt.target as Element | null)?.closest?.(CALL_TILE_SELECTOR);
      const tileUser = tileUserId(tile);
      if (!tileUser) return;
      evt.preventDefault();
      evt.stopPropagation();
      const box = iframe.getBoundingClientRect();
      openCallUserMenu(tileUser, box.left + evt.clientX, box.top + evt.clientY);
    },
    true
  );

  doc.addEventListener('contextmenu', (evt) => {
    // the right-click of `openCallTileMenu` only opens Element Call's tile menu: no Copy menu
    if (openingTileMenu) return;
    const box = iframe.getBoundingClientRect();
    // visibility and pointer-events are inherited from the hidden holder
    if (isCallFrameHidden(getComputedStyle(iframe))) {
      // Option held: developers get the web view menu, as everywhere else
      if (evt.altKey) return;
      // the call view is not visible: nothing of it may react, not even its editable fields
      evt.preventDefault();
      evt.stopPropagation();
      forwardContextMenu(
        document,
        forwardedContextMenuInit(box, evt),
        (init) => new MouseEvent('contextmenu', { ...init, view: window })
      );
      return;
    }
    // the guard already prevented the event unless the native menu is wanted (inputs, Option)
    if (!evt.defaultPrevented) return;
    const text = textToCopy(doc, evt.target);
    if (!text) return;
    const detail: CallFrameMenuDetail = {
      x: box.left + evt.clientX,
      y: box.top + evt.clientY,
      text,
    };
    window.dispatchEvent(new CustomEvent<CallFrameMenuDetail>(CALL_FRAME_MENU_EVENT, { detail }));
  });
};

/**
 * Open Element Call's own menu of a tile (mute for me, volume slider): it is a context menu of
 * the tile, so it gets a right-click at `point` (coordinates in the call document, default: the
 * middle of the tile).
 */
export const openCallTileMenu = (tile: Element, point?: { x: number; y: number }): void => {
  const win = tile.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (!win) return;
  const rect = tile.getBoundingClientRect();
  openingTileMenu = true;
  try {
    tile.dispatchEvent(
      new win.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 2,
        buttons: 2,
        clientX: point?.x ?? rect.left + rect.width / 2,
        clientY: point?.y ?? rect.top + rect.height / 2,
        view: win,
      })
    );
  } finally {
    openingTileMenu = false;
  }
};
