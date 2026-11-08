import { expectedPosition, MAX_RATE, MIN_RATE, SharedWatch } from './protocol';
import { segmentToSkip, SkipSegment } from './sponsorBlock';
import { PlayerState } from './youtube';

// Watch together (#83): keeps the local player on the shared state and turns what the user does
// in the player into changes for everybody. Pure logic (no player, no timers), so it is tested.

/** What the player reports, read at `at` (ms). */
export type PlayerSample = {
  position: number;
  state: number;
  rate: number;
  duration?: number;
  at: number;
};

export type PlayerCommand =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'seek'; to: number }
  | { kind: 'rate'; rate: number };

export type SharedPatch = Partial<Pick<SharedWatch, 'state' | 'position' | 'rate'>>;

export type TickResult = {
  commands: PlayerCommand[];
  /** a change the local user made (to send to everybody) */
  change?: SharedPatch;
  /** set when the change is a SponsorBlock skip */
  skipped?: SkipSegment;
};

export type ControllerOptions = {
  /** seek when the player is further than this from the shared position (s) */
  driftLimit?: number;
  /** ignore player events this long after we commanded the player (ms) */
  suppressMs?: number;
  /** do not repeat a play command more often than this (autoplay may be blocked) (ms) */
  playRetryMs?: number;
};

const isRunning = (state: number) =>
  state === PlayerState.Playing || state === PlayerState.Buffering;

export class WatchController {
  private shared?: SharedWatch;

  private suppressUntil = 0;

  private lastSample?: PlayerSample;

  private lastPlayCommand = -Infinity;

  /** the player matched the shared state at the last quiet tick (only then a jump is the user) */
  private synced = false;

  private readonly driftLimit: number;

  private readonly suppressMs: number;

  private readonly playRetryMs: number;

  public readonly skipped = new Set<string>();

  constructor(options: ControllerOptions = {}) {
    this.driftLimit = options.driftLimit ?? 1.5;
    this.suppressMs = options.suppressMs ?? 1200;
    this.playRetryMs = options.playRetryMs ?? 2500;
  }

  public setShared(shared: SharedWatch | undefined): void {
    if (shared?.session !== this.shared?.session) {
      this.skipped.clear();
      this.lastSample = undefined;
      this.synced = false;
    }
    this.shared = shared;
  }

  public isSuppressed(now: number): boolean {
    return now < this.suppressUntil;
  }

  private commanded(now: number) {
    this.suppressUntil = now + this.suppressMs;
    this.lastSample = undefined;
    this.synced = false;
  }

  /**
   * The player changed its state. Returns a change for everybody when the user pressed play or
   * pause in the player; our own commands (and their echo) are ignored.
   */
  public onPlayerState(state: number, position: number, now: number): SharedPatch | undefined {
    const { shared } = this;
    if (!shared || shared.state === 'stopped' || this.isSuppressed(now)) return undefined;
    if (state === PlayerState.Playing && shared.state === 'paused') {
      return { state: 'playing', position };
    }
    if (state === PlayerState.Paused && shared.state === 'playing') {
      return { state: 'paused', position };
    }
    return undefined;
  }

  /** The user changed the speed in the player. */
  public onPlayerRate(rate: number, now: number): SharedPatch | undefined {
    const { shared } = this;
    if (!shared || shared.state === 'stopped' || this.isSuppressed(now)) return undefined;
    if (rate < MIN_RATE || rate > MAX_RATE || Math.abs(rate - shared.rate) < 0.01) return undefined;
    return { rate };
  }

  /**
   * Called regularly with what the player reports: notices seeks of the user, skips SponsorBlock
   * segments and brings the player back to the shared state (play / pause / seek / speed).
   */
  public tick(
    sample: PlayerSample,
    now: number,
    segments: readonly SkipSegment[] = []
  ): TickResult {
    const { shared } = this;
    if (!shared || shared.state === 'stopped') return { commands: [] };
    const suppressed = this.isSuppressed(now);
    const last = this.lastSample;
    this.lastSample = sample;
    const loaded = sample.state !== PlayerState.Unstarted && sample.state !== PlayerState.Cued;

    // 1. a jump in the player's own timeline that we did not cause: the user seeked (only once
    //    the player was in sync, so jumps while it starts up or loads are not taken for seeks)
    if (!suppressed && this.synced && last && loaded) {
      const elapsed = Math.max(0, sample.at - last.at) / 1000;
      const moved = sample.position - last.position;
      const allowed = isRunning(last.state) ? elapsed * Math.max(last.rate, shared.rate) : 0;
      if (moved < -this.driftLimit || moved > allowed + this.driftLimit) {
        return { commands: [], change: { position: sample.position } };
      }
    }

    // 2. SponsorBlock: skipping is a seek for everybody
    if (!suppressed && shared.state === 'playing' && sample.state === PlayerState.Playing) {
      const segment = segmentToSkip(segments, sample.position, this.skipped);
      if (segment) {
        this.skipped.add(segment.uuid);
        this.commanded(now);
        return {
          commands: [{ kind: 'seek', to: segment.end }],
          change: { position: segment.end },
          skipped: segment,
        };
      }
    }

    // 3. follow the shared state
    const commands: PlayerCommand[] = [];
    let expected = expectedPosition(shared, now);
    const atEnd =
      sample.duration !== undefined &&
      sample.duration > 0 &&
      expected >= sample.duration - this.driftLimit;
    if (sample.duration !== undefined && sample.duration > 0) {
      expected = Math.min(expected, sample.duration);
    }
    const ended = sample.state === PlayerState.Ended;
    if (!(ended && atEnd) && Math.abs(sample.position - expected) > this.driftLimit) {
      commands.push({ kind: 'seek', to: expected });
    }
    if (shared.state === 'playing' && !isRunning(sample.state) && !(ended && atEnd)) {
      if (now - this.lastPlayCommand >= this.playRetryMs) {
        commands.push({ kind: 'play' });
        this.lastPlayCommand = now;
      }
    } else if (shared.state === 'paused' && isRunning(sample.state)) {
      commands.push({ kind: 'pause' });
    }
    if (loaded && Math.abs(sample.rate - shared.rate) >= 0.01) {
      commands.push({ kind: 'rate', rate: shared.rate });
    }
    if (commands.length > 0) this.commanded(now);
    else if (!suppressed && loaded) this.synced = true;
    return { commands };
  }
}
