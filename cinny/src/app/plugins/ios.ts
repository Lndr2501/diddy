/**
 * iOS / iPadOS adjustments of the app shell (src-tauri, `tauri ios build`). The desktop layout
 * already adapts to small screens; what is missing on iOS is the system around it:
 *
 * - Safe areas: the web view runs edge to edge (`viewport-fit=cover`), so `#root` is padded by
 *   the notch / home indicator insets (index.css, `html.ios`).
 * - Software keyboard: WKWebView does not shrink the layout viewport when the keyboard opens, it
 *   scrolls the whole page up instead, which pushes the room header off screen. The visible height
 *   is mirrored into `--diddy-viewport-height` and the page scroll is reset, so the composer sits
 *   right above the keyboard like in a native app.
 * - Links: iOS has no "new window" callback in Tauri, so target=_blank links and window.open()
 *   would do nothing. External http(s)/mailto/tel links go to the opener plugin (Safari, Mail ...).
 */
import { canInvoke, invoke } from './tauri';

type NavigatorLike = { userAgent?: string; platform?: string; maxTouchPoints?: number };

/** iPhone, iPod and iPad. iPadOS reports itself as a Mac ("MacIntel"), but Macs have no touch. */
export const isIOSPlatform = (nav: NavigatorLike | undefined): boolean => {
  if (!nav) return false;
  if (/iPad|iPhone|iPod/.test(nav.userAgent ?? '')) return true;
  return /^Mac/.test(nav.platform ?? '') && (nav.maxTouchPoints ?? 0) > 1;
};

export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && isIOSPlatform(navigator as NavigatorLike);

const EXTERNAL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * The URL to hand to the system for a link, or undefined when the web view should handle it
 * itself (in-app routes, blob/data downloads, javascript: and unknown schemes).
 */
export const externalUrl = (
  href: string | null | undefined,
  pageOrigin: string
): string | undefined => {
  if (!href) return undefined;
  let url: URL;
  try {
    url = new URL(href, pageOrigin);
  } catch {
    return undefined;
  }
  if (!EXTERNAL_SCHEMES.includes(url.protocol)) return undefined;
  if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === pageOrigin) {
    return undefined;
  }
  return url.href;
};

/** Pixels the software keyboard (or another overlay) takes from the bottom of the layout viewport. */
export const keyboardInset = (layoutHeight: number, visibleHeight: number, offsetTop = 0): number =>
  Math.max(0, Math.round(layoutHeight - visibleHeight - offsetTop));

/** A keyboard is open when it covers more than the bottom inset of a home indicator would. */
const KEYBOARD_THRESHOLD = 120;

const openExternal = (url: string) => {
  invoke('plugin:opener|open_url', { url }).catch(() => undefined);
};

const installLinkHandling = () => {
  document.addEventListener(
    'click',
    (evt) => {
      if (evt.defaultPrevented || evt.button !== 0) return;
      const target = evt.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download')) return;
      const url = externalUrl(anchor.getAttribute('href'), window.location.origin);
      if (!url) return;
      evt.preventDefault();
      openExternal(url);
    },
    true
  );

  const originalOpen = window.open.bind(window);
  window.open = (url?: string | URL, ...rest) => {
    const external = externalUrl(url?.toString(), window.location.origin);
    if (external) {
      openExternal(external);
      return null;
    }
    return originalOpen(url, ...rest);
  };
};

const installViewportTracking = () => {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  if (!viewport) return;

  const update = () => {
    root.style.setProperty('--diddy-viewport-height', `${Math.round(viewport.height)}px`);
    const inset = keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop);
    root.classList.toggle('ios-keyboard-open', inset > KEYBOARD_THRESHOLD);
    // WKWebView scrolls the document to reveal the focused field; the layout already fits the
    // visible area, so undo that scroll or the header disappears above the screen.
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  window.addEventListener('orientationchange', update);
  update();
};

/** Call once at startup; does nothing outside iOS. */
export const installIOSShell = () => {
  if (!isIOS()) return;
  document.documentElement.classList.add('ios');
  installViewportTracking();
  if (canInvoke()) installLinkHandling();
};
