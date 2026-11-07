/**
 * Right-click inside the embedded call (Element Call): Diddy's message menu does not exist there,
 * and the web view's own menu is switched off (Reload, Inspect ...). The text under the pointer
 * (or the selection) is handed to the app, which shows a small Copy menu in the main window; a
 * menu injected into the call page itself was never visible.
 */
const MAX_COPY = 4000;
export const CALL_FRAME_MENU_EVENT = 'diddy-call-frame-menu';

export type CallFrameMenuDetail = { x: number; y: number; text: string };

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
    // the guard already prevented the event unless the native menu is wanted (inputs, Option)
    if (!evt.defaultPrevented) return;
    const text = textToCopy(doc, evt.target);
    const box = iframe.getBoundingClientRect();
    const holder = iframe.parentElement;
    const holderStyle = holder ? getComputedStyle(holder) : undefined;
    log?.(
      `frame menu: copyable text ${text.length} chars${text ? '' : ' (nothing to copy, no menu)'} ` +
        `iframe=${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)} ` +
        `holder visibility=${holderStyle?.visibility} pointerEvents=${holderStyle?.pointerEvents} ` +
        `iframePointerEvents=${getComputedStyle(iframe).pointerEvents} route=${window.location.pathname}${window.location.hash}`
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
