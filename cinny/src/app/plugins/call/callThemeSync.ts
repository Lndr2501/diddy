/**
 * Theme changes for the call page (#161).
 *
 * The call page (Element Call) only answers widget messages once its widget API runs. A message
 * sent earlier is lost: the app then waits 10 s for an answer and fails with "Request timed out"
 * (the unhandled rejection in the #161 log, on every call start), or with "Transport stopped" when
 * the call ends within those 10 s. The theme used to be sent as soon as the call was created.
 *
 * So a change waits until the widget is ready, a theme the page already has (it gets the theme in
 * its URL) is not sent at all, and a failed delivery is written to the log instead of rejecting.
 */
export type ThemeSync<T> = {
  /** The app's theme is now `theme`. */
  set: (theme: T) => void;
  /** The call page answers widget messages from now on. */
  ready: () => void;
  /** The call is gone: nothing is sent any more. */
  stop: () => void;
};

export const createThemeSync = <T>(
  initial: T,
  send: (theme: T) => Promise<unknown>,
  log: (message: string) => void
): ThemeSync<T> => {
  let ready = false;
  let stopped = false;
  // the theme the page has (as far as we know); undefined after a failed delivery
  let shown: T | undefined = initial;
  let wanted = initial;

  const flush = () => {
    if (!ready || stopped || wanted === shown) return;
    const theme = wanted;
    shown = theme;
    send(theme).catch((e) => {
      if (stopped) return;
      if (shown === theme) shown = undefined;
      log(`call theme change to ${String(theme)} not delivered (${String(e)})`);
    });
  };

  return {
    set: (theme) => {
      wanted = theme;
      flush();
    },
    ready: () => {
      ready = true;
      flush();
    },
    stop: () => {
      stopped = true;
    },
  };
};
