/**
 * "Matrix für Discord-Umsteiger" (#30): remembers whether the intro was shown and lets other parts
 * of the app open it again. The content lives in features/intro.
 */
const OPEN_EVENT = 'diddy-intro-open';
const storageKey = (userId: string) => `diddy-intro-seen:${userId}`;

export const hasSeenIntro = (userId: string): boolean => {
  try {
    return localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    // storage can be unavailable; then the intro is simply not forced on every start
    return true;
  }
};

export const markIntroSeen = (userId: string): void => {
  try {
    localStorage.setItem(storageKey(userId), '1');
  } catch {
    // nothing to remember it in
  }
};

/** Asks the intro dialog to open (account menu, settings). */
export const openIntro = (): void => {
  window.dispatchEvent(new Event(OPEN_EVENT));
};

export const onOpenIntro = (listener: () => void): (() => void) => {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
};
