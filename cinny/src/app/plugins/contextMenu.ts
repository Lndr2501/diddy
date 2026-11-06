/**
 * Right-click handling of the desktop app. The web view's own menu (Reload, Inspect Element, Look
 * Up ...) is not part of Diddy and showed up whenever an app handler stepped aside, for example
 * while any text was selected. In the desktop app only editable fields keep it (paste, spelling);
 * everything else belongs to Diddy's own menus. With Developer Tools on it stays available.
 */
import { canInvoke } from './tauri';

type ElementLike = { closest?: (selector: string) => unknown } | null | undefined;

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** True when the web view's native menu is wanted for a right-click on `target`. */
export const wantsNativeContextMenu = (target: unknown, developerTools: boolean): boolean => {
  if (developerTools) return true;
  const el = target as ElementLike;
  return !!el && typeof el.closest === 'function' && !!el.closest(EDITABLE);
};

/**
 * True when a Diddy menu must step aside for the native one: only in a plain browser, where the
 * user may want the browser's own menu over selected text or links.
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

/** Call once at startup, in the desktop app only. */
export const installContextMenuGuard = (isDeveloperToolsOn: () => boolean): void => {
  if (!canInvoke()) return;
  document.addEventListener('contextmenu', (evt) => {
    if (!wantsNativeContextMenu(evt.target, isDeveloperToolsOn())) evt.preventDefault();
  });
};
