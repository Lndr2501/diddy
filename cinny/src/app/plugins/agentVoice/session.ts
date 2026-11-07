// Talking-to-agent session (#57): sources, release delay, safety timeout, microphone.

/** The microphone of the call the user is in. */
export type AgentMic = {
  isLive(): boolean;
  setLive(live: boolean): void;
};

export type AgentSource = 'hotkey' | 'trigger';

export type Timers = {
  set: (run: () => void, ms: number) => number;
  clear: (id: number) => void;
};

export type AgentSessionDeps = {
  timers: Timers;
  /** current call microphone, undefined outside a (joined) call */
  getMic: () => AgentMic | undefined;
  muteMic: () => boolean;
  onActiveChange: (active: boolean) => void;
};

/** Dictation tools still record a moment after the key is let go. */
export const RELEASE_DELAY_MS = 350;
/** Nobody dictates this long: a lost key-up or a forgotten `start` must not mute forever. */
export const MAX_ACTIVE_MS = 5 * 60 * 1000;

/**
 * Talking-to-agent session: combines the sources, mutes the microphone when it starts (if wanted)
 * and turns it back on afterwards, but only when Diddy muted it, it is still muted and it is still
 * the same call. Unmuting by hand in between is respected.
 */
export class AgentVoiceSession {
  private sources = new Set<AgentSource>();

  private active = false;

  private releaseTimer?: number;

  private maxTimer?: number;

  private mutedMic?: AgentMic;

  private readonly deps: AgentSessionDeps;

  constructor(deps: AgentSessionDeps) {
    this.deps = deps;
  }

  public get isActive(): boolean {
    return this.active;
  }

  public set(source: AgentSource, on: boolean): void {
    if (on) this.sources.add(source);
    else this.sources.delete(source);

    if (this.sources.size > 0) {
      this.clearRelease();
      if (!this.active) this.start();
      return;
    }
    if (this.active && this.releaseTimer === undefined) {
      this.releaseTimer = this.deps.timers.set(() => {
        this.releaseTimer = undefined;
        this.stop();
      }, RELEASE_DELAY_MS);
    }
  }

  /** Ends the session right away (feature switched off, app closing, safety timeout). */
  public reset(): void {
    this.sources.clear();
    this.clearRelease();
    if (this.active) this.stop();
  }

  private start(): void {
    this.active = true;
    this.maxTimer = this.deps.timers.set(() => {
      this.maxTimer = undefined;
      this.reset();
    }, MAX_ACTIVE_MS);
    if (this.deps.muteMic()) {
      const mic = this.deps.getMic();
      if (mic?.isLive()) {
        mic.setLive(false);
        this.mutedMic = mic;
      }
    }
    this.deps.onActiveChange(true);
  }

  private stop(): void {
    this.active = false;
    if (this.maxTimer !== undefined) this.deps.timers.clear(this.maxTimer);
    this.maxTimer = undefined;
    const muted = this.mutedMic;
    this.mutedMic = undefined;
    const mic = this.deps.getMic();
    if (muted && mic === muted && !mic.isLive()) mic.setLive(true);
    this.deps.onActiveChange(false);
  }

  private clearRelease(): void {
    if (this.releaseTimer !== undefined) this.deps.timers.clear(this.releaseTimer);
    this.releaseTimer = undefined;
  }
}
