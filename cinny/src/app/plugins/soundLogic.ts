/**
 * Decisions behind the message and call sounds, kept free of React, Matrix and audio so they can
 * be tested on their own (tests/soundLogic.test.cjs).
 */

/** How long an outgoing call rings: the lifetime Element Call puts on the ring it sends. */
export const RINGBACK_MAX_MS = 30000;
/** The ringback starts after the "you join" sound, not on top of it. */
export const RINGBACK_START_DELAY_MS = 1200;

/**
 * A notifying message plays the mention sound when it highlights you: the push rules say so, or
 * the room's highlight count went up with it. Otherwise it is a plain new message.
 */
export const pickMessageSound = (
  pushHighlight: boolean | undefined,
  highlightBefore: number | undefined,
  highlightAfter: number
): 'mention' | 'message' => {
  if (pushHighlight) return 'mention';
  if (highlightBefore !== undefined && highlightAfter > highlightBefore) return 'mention';
  return 'message';
};

export type DeclineInfo = {
  sender?: string;
  /** The event the decline refers to (m.relates_to, rel_type m.reference). */
  relatesTo?: string;
  /** Who sent that event, when this client has it; undefined when it is not in the timeline. */
  relatesToSender?: string;
};

/**
 * A decline stops your ringback when someone else declined a ring you sent. When the ring it
 * refers to is not in the local timeline, it still counts: it can only arrive in the room you
 * are ringing, while you are ringing.
 */
export const isDeclineOfOwnRing = (decline: DeclineInfo, ownUserId: string): boolean => {
  if (!decline.sender || decline.sender === ownUserId || !decline.relatesTo) return false;
  return decline.relatesToSender === undefined || decline.relatesToSender === ownUserId;
};

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/**
 * Turns several "is this link up?" signals (browser online, Matrix sync, the call's media
 * connections) into one "connection lost" moment. A signal has to stay down for `graceMs` before
 * it counts, so short blips stay silent, and after one announcement it stays quiet until every
 * signal is back up again.
 */
export class ConnectionLossDetector {
  private readonly down = new Set<string>();

  private pending: unknown;

  private announced = false;

  private stopped = false;

  private readonly onLost: () => void;

  private readonly graceMs: number;

  private readonly timers: Timers;

  constructor(onLost: () => void, graceMs?: number, timers?: Timers) {
    this.onLost = onLost;
    this.graceMs = graceMs ?? 3000;
    this.timers = timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  }

  /** Reports a signal; `ok` false means that link is down. */
  public set(signal: string, ok: boolean): void {
    if (this.stopped) return;
    if (ok) this.down.delete(signal);
    else this.down.add(signal);

    if (this.down.size === 0) {
      this.cancel();
      this.announced = false;
      return;
    }
    if (this.announced || this.pending !== undefined) return;
    this.pending = this.timers.setTimeout(() => {
      this.pending = undefined;
      if (this.stopped || this.down.size === 0 || this.announced) return;
      this.announced = true;
      this.onLost();
    }, this.graceMs);
  }

  /** You left the call: nothing is announced any more. */
  public stop(): void {
    this.stopped = true;
    this.cancel();
  }

  private cancel(): void {
    if (this.pending === undefined) return;
    this.timers.clearTimeout(this.pending);
    this.pending = undefined;
  }
}
