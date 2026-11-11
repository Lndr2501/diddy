/**
 * Where the time goes between pressing "join" and seeing the people in the call (#161).
 * Every step is written once to the diagnostic log (`~/Library/Logs/Diddy/app.log`) as
 * `call join: <step> +<since last step> ms (<since the click> ms)`, so a slow join can be read off
 * the log instead of guessed.
 */
export type JoinTimer = {
  /**
   * Logs `step` the first time it is seen; later calls with the same name are ignored. `detail`
   * is appended to the line (for example how long a request took) and not part of the name.
   */
  mark: (step: string, detail?: string) => void;
};

export const createJoinTimer = (
  log: (message: string) => void,
  now: () => number = () => performance.now()
): JoinTimer => {
  const start = now();
  let last = start;
  const seen = new Set<string>();
  return {
    mark: (step, detail) => {
      if (seen.has(step)) return;
      seen.add(step);
      const t = now();
      log(
        `call join: ${step} +${Math.round(t - last)} ms (${Math.round(t - start)} ms)${
          detail ? `, ${detail}` : ''
        }`
      );
      last = t;
    },
  };
};

/**
 * The call page asks the LiveKit authorisation service (lk-jwt-service) for its access token at
 * `<service>/sfu/get` (legacy) or `<service>/get_token`. Without that token it cannot connect, so
 * nobody else is shown yet: the time of this request is the server part of a slow join.
 */
export const isLivekitTokenRequest = (url: string): boolean => {
  try {
    return /\/(sfu\/get|get_token)$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

/**
 * What the call page already shows: video tiles and how many of them are somebody else's.
 * `tiles` counts every participant tile (including yours).
 */
export const countTiles = (doc: Document | undefined | null): number => {
  try {
    return doc?.querySelectorAll('[data-testid="videoTile"]').length ?? 0;
  } catch {
    return 0;
  }
};

/** How long a to-device message that the call page did not answer is retried once, in ms. */
export const TO_DEVICE_RETRY_MS = 2000;

/** Report the first media connection and detach the listener on connection or call disposal. */
export const watchMediaConnected = (pc: RTCPeerConnection, connected: () => void): (() => void) => {
  const onChange = () => {
    if (pc.connectionState !== 'connected') return;
    pc.removeEventListener('connectionstatechange', onChange);
    connected();
  };
  pc.addEventListener('connectionstatechange', onChange);
  onChange();
  return () => pc.removeEventListener('connectionstatechange', onChange);
};
