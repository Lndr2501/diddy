// Talking-to-agent session (#57): sources, release delay, safety timeout, microphone.

/** The microphone and the sound of the call the user is in. */
export type AgentMic = {
  isLive(): boolean;
  setLive(live: boolean): void;
  isDeafened(): boolean;
  /** Deafening also mutes the microphone; undeafening restores it (see CallControl.toggleSound). */
  setDeafened(deafened: boolean): void;
};

/** What happens to the call while talking to the agent: nothing, mic off, or mic and sound off. */
export type AgentMuteMode = 'off' | 'mute' | 'full';

/** Reads the stored choice. `muteMic` is the older on/off setting it replaces. */
export const parseMuteMode = (muteMode: unknown, muteMic: unknown): AgentMuteMode => {
  if (muteMode === 'off' || muteMode === 'mute' || muteMode === 'full') return muteMode;
  return muteMic === false ? 'off' : 'mute';
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
  muteMode: () => AgentMuteMode;
  onActiveChange: (active: boolean) => void;
};

/** Dictation tools still record a moment after the key is let go. */
export const RELEASE_DELAY_MS = 350;
/** Nobody dictates this long: a lost key-up or a forgotten `start` must not mute forever. */
export const MAX_ACTIVE_MS = 5 * 60 * 1000;

/**
 * Talking-to-agent session: combines the sources, mutes the microphone or deafens when it starts
 * (if wanted) and undoes that afterwards, but only when Diddy did it, it is still in place and it
 * is still the same call. Unmuting or undeafening by hand in between is respected.
 */
export class AgentVoiceSession {
  private sources = new Set<AgentSource>();

  private active = false;

  private releaseTimer?: number;

  private maxTimer?: number;

  private mutedMic?: AgentMic;

  private deafenedCall?: AgentMic;

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
    const mode = this.deps.muteMode();
    const mic = this.deps.getMic();
    if (mode === 'full' && mic && !mic.isDeafened()) {
      mic.setDeafened(true);
      this.deafenedCall = mic;
    } else if (mode === 'mute' && mic?.isLive()) {
      mic.setLive(false);
      this.mutedMic = mic;
    }
    this.deps.onActiveChange(true);
  }

  private stop(): void {
    this.active = false;
    if (this.maxTimer !== undefined) this.deps.timers.clear(this.maxTimer);
    this.maxTimer = undefined;
    const muted = this.mutedMic;
    const deafened = this.deafenedCall;
    this.mutedMic = undefined;
    this.deafenedCall = undefined;
    const mic = this.deps.getMic();
    if (muted && mic === muted && !mic.isLive()) mic.setLive(true);
    if (deafened && mic === deafened && mic.isDeafened()) mic.setDeafened(false);
    this.deps.onActiveChange(false);
  }

  private clearRelease(): void {
    if (this.releaseTimer !== undefined) this.deps.timers.clear(this.releaseTimer);
    this.releaseTimer = undefined;
  }
}
