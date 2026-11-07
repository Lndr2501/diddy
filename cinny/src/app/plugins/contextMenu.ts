/**
 * Right-click handling of the desktop app. The web view's own menu (Reload, Inspect Element, Look
 * Up ...) is not part of Diddy and showed up whenever an app handler stepped aside, for example
 * while any text was selected. In the desktop app only editable fields keep it (paste, spelling).
 * Developers get it by holding Option (⌥) while right-clicking; that works with Developer Tools on
 * or off, so the setting no longer brings the web view menu back for normal clicks.
 */
import { canInvoke } from './tauri';

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
    if (!wantsNativeContextMenu(evt)) evt.preventDefault();
  });
};
