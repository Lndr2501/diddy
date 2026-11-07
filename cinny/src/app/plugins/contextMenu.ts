/**
 * Right-click handling of the desktop app. The web view's own menu (Reload, Inspect Element, Look
 * Up ...) is not part of Diddy and showed up whenever an app handler stepped aside, for example
 * while any text was selected. In the desktop app only editable fields keep it (paste, spelling).
 * Developers get it by holding Option (⌥) while right-clicking; that works with Developer Tools on
 * or off, so the setting no longer brings the web view menu back for normal clicks.
 */
import { canInvoke, invoke } from './tauri';

type ElementLike = { closest?: (selector: string) => unknown } | null | undefined;
type ContextMenuEventLike = { target: unknown; altKey?: boolean };

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
const GUARD_MARK = '__diddyContextMenuGuard';

/** True when the web view's native menu is wanted for this right-click. */
export const wantsNativeContextMenu = (evt: ContextMenuEventLike): boolean => {
  if (evt.altKey) return true;
  const el = evt.target as ElementLike;
  return !!el && typeof el.closest === 'function' && !!el.closest(EDITABLE);
};

/**
 * True when a Diddy menu must step aside for the native one: Option held (developers), or in a
 * plain browser over selected text or links, where the browser's own menu is expected.
 */
export const deferToNativeMenu = (
  evt: { altKey: boolean; target: unknown },
  desktop: boolean = canInvoke()
): boolean => {
  if (evt.altKey) return true;
  if (desktop) return false;
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  if (selection && !selection.isCollapsed) return true;
  const tag = (evt.target as { tagName?: unknown } | null)?.tagName;
  return typeof tag === 'string' && tag.toLowerCase() === 'a';
};

/**
 * DIAGNOSE (right-click on messages opens nothing): one line per right-click in the app log
 * (~/Library/Logs/Diddy/app.log). Remove once the cause is found.
 */
export const diagContextMenu = (message: string): void => {
  if (!canInvoke()) return;
  try {
    invoke('diag_log', { line: `contextmenu: ${message}` }).catch(() => {});
  } catch {
    // diagnostics must never break the right-click
  }
};

type DiagElement = {
  tagName?: unknown;
  id?: unknown;
  className?: unknown;
  parentElement?: unknown;
  getAttribute?: (name: string) => string | null;
};

/** Short path of an element and its ancestors ("span.cls < div[msg] < ..."). */
export const describeElement = (node: unknown, depth = 7): string => {
  const parts: string[] = [];
  let el = node as DiagElement | null | undefined;
  while (el && typeof el.tagName === 'string' && parts.length < depth) {
    let part = el.tagName.toLowerCase();
    if (typeof el.id === 'string' && el.id) part += `#${el.id}`;
    const cls =
      typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    if (cls) part += `.${cls}`;
    if (typeof el.getAttribute === 'function') {
      if (el.getAttribute('data-message-id')) part += '[msg]';
      if (el.getAttribute('data-call-embed-container') !== null) part += '[call-embed]';
      if (el.getAttribute('data-tauri-drag-region') !== null) part += '[drag]';
    }
    parts.push(part);
    el = el.parentElement as DiagElement | null | undefined;
  }
  return parts.join(' < ') || 'none';
};

const describeContextMenu = (evt: MouseEvent, doc: unknown): string => {
  const d = doc as {
    elementFromPoint?: (x: number, y: number) => unknown;
    defaultView?: { getSelection?: () => { isCollapsed: boolean } | null };
  };
  const selection = d.defaultView?.getSelection?.();
  const top =
    typeof d.elementFromPoint === 'function' ? d.elementFromPoint(evt.clientX, evt.clientY) : null;
  const el = evt.target as { closest?: (s: string) => unknown } | null;
  const inMessage = !!el && typeof el.closest === 'function' && !!el.closest('[data-message-id]');
  return [
    `handled=${evt.defaultPrevented}`,
    `inMessage=${inMessage}`,
    `button=${evt.button} alt=${evt.altKey} ctrl=${evt.ctrlKey}`,
    `selection=${selection ? (selection.isCollapsed ? 'collapsed' : 'range') : 'none'}`,
    `at=${Math.round(evt.clientX)},${Math.round(evt.clientY)}`,
    `target=${describeElement(evt.target)}`,
    top === evt.target ? 'top=target' : `top=${describeElement(top)}`,
  ].join(' ');
};

type GuardTarget = {
  addEventListener: (type: 'contextmenu', listener: (evt: MouseEvent) => void) => void;
};

/**
 * Call once per document in the desktop app: the main page at startup and every same-origin frame
 * (the call view). Installing twice on the same document is ignored.
 */
export const installContextMenuGuard = (
  target: GuardTarget | null | undefined = document
): void => {
  if (!canInvoke() || !target) return;
  const marked = target as GuardTarget & { [GUARD_MARK]?: boolean };
  if (marked[GUARD_MARK]) return;
  marked[GUARD_MARK] = true;
  target.addEventListener('contextmenu', (evt) => {
    const native = wantsNativeContextMenu(evt);
    // DIAGNOSE: runs after React's handlers (bubble phase on the document), so handled=true means
    // a Diddy menu took the right-click.
    try {
      diagContextMenu(
        `${target === globalThis.document ? 'main' : 'frame'} native=${native} ${describeContextMenu(evt, target)}`
      );
    } catch {
      // diagnostics must never break the right-click
    }
    if (!native) evt.preventDefault();
  });
};
