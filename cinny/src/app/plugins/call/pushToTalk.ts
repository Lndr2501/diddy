/**
 * Push-to-talk: in this mode the microphone of the call is off unless the push-to-talk key (or the
 * microphone button) is held. Pure logic, no React and no call, so it can be tested without a
 * browser (tests/pushToTalk.test.cjs). Wired up in components/PushToTalkSync.tsx.
 *
 * Rules:
 * - holding any source (key in the window, key read by the desktop app, the button) opens it;
 * - letting go of the last one closes it after the release delay (pressing again cancels that);
 * - full mute wins: while fully muted it never opens and closes at once, and push-to-talk never
 *   lifts the full mute (#225: only a microphone you switch on yourself does that);
 * - while you talk to an agent (agent voice) it stays closed too, so the dictation does not go
 *   into the call.
 */

export type InputMode = 'voice' | 'ptt';

/** What holds the microphone open. */
export type PttSource = 'key' | 'system' | 'button';

export const MAX_RELEASE_DELAY_MS = 500;
export const DEFAULT_RELEASE_DELAY_MS = 200;

/** Release delay from storage or the settings: whole milliseconds between 0 and 500. */
export const clampReleaseDelay = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RELEASE_DELAY_MS;
  return Math.min(MAX_RELEASE_DELAY_MS, Math.max(0, Math.round(value)));
};

export type PttTimers = {
  set: (run: () => void, ms: number) => number;
  clear: (id: number) => void;
};

export type PushToTalkOptions = {
  timers: PttTimers;
  releaseDelayMs: () => number;
  /** the microphone should now be open (true) or closed (false) */
  onChange: (open: boolean) => void;
};

export class PushToTalk {
  private readonly held = new Set<PttSource>();

  private fullMuted = false;

  private blocked = false;

  private open = false;

  private releaseTimer: number | undefined;

  private readonly options: PushToTalkOptions;

  constructor(options: PushToTalkOptions) {
    this.options = options;
  }

  public get isOpen(): boolean {
    return this.open;
  }

  /** Something is held, whether or not that opens the microphone. */
  public get isHeld(): boolean {
    return this.held.size > 0;
  }

  public setHeld(source: PttSource, down: boolean): void {
    if (down) this.held.add(source);
    else this.held.delete(source);
    this.update();
  }

  public setFullMuted(fullMuted: boolean): void {
    this.fullMuted = fullMuted;
    this.update();
  }

  /** Talking to an agent: the microphone stays closed meanwhile. */
  public setBlocked(blocked: boolean): void {
    this.blocked = blocked;
    this.update();
  }

  /** Forgets every held source and closes (call left, mode switched off). */
  public reset(): void {
    this.held.clear();
    this.cancelRelease();
    this.setOpen(false);
  }

  private get wanted(): boolean {
    return this.held.size > 0 && !this.fullMuted && !this.blocked;
  }

  private update(): void {
    if (this.wanted) {
      this.cancelRelease();
      this.setOpen(true);
      return;
    }
    if (!this.open) {
      this.cancelRelease();
      return;
    }
    // full mute and agent voice close at once, only letting go waits
    const delay = this.fullMuted || this.blocked ? 0 : clampReleaseDelay(this.options.releaseDelayMs());
    if (delay === 0) {
      this.cancelRelease();
      this.setOpen(false);
      return;
    }
    if (this.releaseTimer !== undefined) return;
    this.releaseTimer = this.options.timers.set(() => {
      this.releaseTimer = undefined;
      if (!this.wanted) this.setOpen(false);
    }, delay);
  }

  private cancelRelease(): void {
    if (this.releaseTimer === undefined) return;
    this.options.timers.clear(this.releaseTimer);
    this.releaseTimer = undefined;
  }

  private setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.options.onChange(open);
  }
}

/** Minimum time between two requests for the same microphone state while the page has not caught up. */
export const MIC_RESEND_MS = 400;

/**
 * Whether to (re)send the wanted microphone state: when it changed, or when the call still reports
 * something else (the page switched the microphone by itself, or a request raced with the next one)
 * and the last request is a moment old.
 */
export const shouldSendMic = (
  wanted: boolean,
  live: boolean,
  lastSent: boolean | undefined,
  lastSentAt: number,
  now: number
): boolean => {
  if (wanted !== lastSent) return true;
  return live !== wanted && now - lastSentAt >= MIC_RESEND_MS;
};

const TEXT_CODE = /^(Key[A-Z]|Digit\d|Numpad\d|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash)$/;

/**
 * A key press inside the window counts for push-to-talk, unless it types text into a field: a
 * plain letter as push-to-talk key must still be typeable in the composer.
 */
export const pageKeyCounts = (
  hotkey: { code: string; ctrl: boolean; alt: boolean; meta: boolean } | undefined,
  inEditable: boolean
): boolean => {
  if (!hotkey) return false;
  if (!inEditable) return true;
  if (hotkey.ctrl || hotkey.alt || hotkey.meta) return true;
  return !TEXT_CODE.test(hotkey.code);
};
