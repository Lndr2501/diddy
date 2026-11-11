/**
 * Where the time goes between pressing "join" and seeing the people in the call (#161).
 * Every step is written once to the diagnostic log (`~/Library/Logs/Diddy/app.log`) as
 * `call join: <step> +<since last step> ms (<since the click> ms)`, so a slow join can be read off
 * the log instead of guessed.
 */
export type JoinTimer = {
  /** Logs `step` the first time it is seen; later calls with the same name are ignored. */
  mark: (step: string) => void;
};

export const createJoinTimer = (
  log: (message: string) => void,
  now: () => number = () => performance.now()
): JoinTimer => {
  const start = now();
  let last = start;
  const seen = new Set<string>();
  return {
    mark: (step) => {
      if (seen.has(step)) return;
      seen.add(step);
      const t = now();
      log(`call join: ${step} +${Math.round(t - last)} ms (${Math.round(t - start)} ms)`);
      last = t;
    },
  };
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
