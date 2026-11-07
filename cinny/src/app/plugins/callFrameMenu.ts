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
import { describeElement } from './contextMenu';

const MAX_COPY = 4000;
export const CALL_FRAME_MENU_EVENT = 'diddy-call-frame-menu';

export type CallFrameMenuDetail = { x: number; y: number; text: string };

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

export const installCallFrameMenu = (
  doc: Document | null | undefined,
  iframe: HTMLIFrameElement,
  log?: (message: string) => void
): void => {
  if (!doc || !doc.body) return;
  const marked = doc as Document & { __diddyFrameMenu?: boolean };
  if (marked.__diddyFrameMenu) return;
  marked.__diddyFrameMenu = true;

  doc.addEventListener('contextmenu', (evt) => {
    const box = iframe.getBoundingClientRect();
    // visibility and pointer-events are inherited from the hidden holder
    if (isCallFrameHidden(getComputedStyle(iframe))) {
      // Option held: developers get the web view menu, as everywhere else
      if (evt.altKey) return;
      // the call view is not visible: nothing of it may react, not even its editable fields
      evt.preventDefault();
      evt.stopPropagation();
      const { target, handled } = forwardContextMenu(
        document,
        forwardedContextMenuInit(box, evt),
        (init) => new MouseEvent('contextmenu', { ...init, view: window })
      );
      log?.(
        `frame menu: call view hidden, right-click passed to the main window ` +
          `handled=${handled} target=${describeElement(target)}`
      );
      return;
    }
    // the guard already prevented the event unless the native menu is wanted (inputs, Option)
    if (!evt.defaultPrevented) return;
    const text = textToCopy(doc, evt.target);
    const holder = iframe.parentElement;
    const holderStyle = holder ? getComputedStyle(holder) : undefined;
    log?.(
      `frame menu: copyable text ${text.length} chars${
        text ? '' : ' (nothing to copy, no menu)'
      } ` +
        `iframe=${Math.round(box.left)},${Math.round(box.top)} ${Math.round(
          box.width
        )}x${Math.round(box.height)} ` +
        `holder visibility=${holderStyle?.visibility} pointerEvents=${holderStyle?.pointerEvents} ` +
        `iframePointerEvents=${getComputedStyle(iframe).pointerEvents} route=${
          window.location.pathname
        }${window.location.hash}`
    );
    if (!text) return;
    const detail: CallFrameMenuDetail = {
      x: box.left + evt.clientX,
      y: box.top + evt.clientY,
      text,
    };
    window.dispatchEvent(new CustomEvent<CallFrameMenuDetail>(CALL_FRAME_MENU_EVENT, { detail }));
  });
};
