/**
 * Keeping profile data reachable for members who join an options room later.
 *
 * Matrix sends *state events* to everyone who joins, so a normal options room needs nothing here.
 * A "message mode" room (no marker event, or the user may not write state in it) carries the Diddy
 * data as ordinary timeline events instead, and a member who joins today never receives the
 * messages from last year. So every Diddy client sends its own profile again:
 *
 *  - once when it joins the room itself (or the client comes online and sees the room), and
 *  - again whenever other members join after that.
 *
 * The rules below keep that from becoming spam: joins are collected for ANNOUNCE_DEBOUNCE_MS, one
 * room answers at most every ANNOUNCE_MIN_INTERVAL_MS (a join inside that period is answered when
 * it is over, not dropped), joins that are older than our last answer are ignored, and only a
 * bounded number of rooms can be queued. Pure logic, no Matrix client, so
 * it is covered by the hardware-free tests in cinny/tests.
 */

export const ANNOUNCE_DEBOUNCE_MS = 20 * 1000;
export const ANNOUNCE_MIN_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_ANNOUNCE_ROOMS = 50;

export type AnnounceTiming = {
  /** collection window before a send (default ANNOUNCE_DEBOUNCE_MS) */
  debounceMs?: number;
  /** minimum distance between two sends for one room (default ANNOUNCE_MIN_INTERVAL_MS) */
  minIntervalMs?: number;
};

export type Clock = {
  now: () => number;
  start: (run: () => void, ms: number) => number;
  stop: (timer: number) => void;
};

export class ReAnnouncer {
  private pending = new Map<string, number>();
  private lastSent = new Map<string, number>();

  private debounceMs: number;
  private minIntervalMs: number;

  constructor(
    private clock: Clock,
    private send: (roomId: string) => void,
    timing: AnnounceTiming = {}
  ) {
    this.debounceMs = timing.debounceMs ?? ANNOUNCE_DEBOUNCE_MS;
    this.minIntervalMs = timing.minIntervalMs ?? ANNOUNCE_MIN_INTERVAL_MS;
  }

  /**
   * Queue one answer for `roomId`. Returns true when a timer was started.
   *
   * `force` is for our own join or a profile change, which must not wait out the quiet period.
   * `joinTs` is the timestamp of the other member's join; anything at or before our last answer was
   * already covered by what we sent then.
   */
  schedule(
    roomId: string,
    { force = false, joinTs }: { force?: boolean; joinTs?: number } = {}
  ): boolean {
    if (this.pending.has(roomId) && !force) return false;
    const now = this.clock.now();
    const last = this.lastSent.get(roomId);
    let delay = this.debounceMs;
    if (!force && last !== undefined) {
      // already covered by what we sent after that join
      if ((joinTs ?? now) <= last) return false;
      // inside the quiet period: do not drop the join, answer it when the period is over
      delay = Math.max(delay, last + this.minIntervalMs - now);
    }
    if (!this.pending.has(roomId) && this.pending.size >= MAX_ANNOUNCE_ROOMS) return false;
    const existing = this.pending.get(roomId);
    if (existing !== undefined) this.clock.stop(existing);
    const timer = this.clock.start(() => {
      this.pending.delete(roomId);
      this.lastSent.set(roomId, this.clock.now());
      this.send(roomId);
    }, delay);
    this.pending.set(roomId, timer);
    return true;
  }

  /** Records that the profile of this client was written to the room right now. */
  markSent(roomId: string): void {
    this.lastSent.set(roomId, this.clock.now());
  }

  /** A room we left must not keep a queued send. */
  forget(roomId: string): void {
    const timer = this.pending.get(roomId);
    if (timer !== undefined) this.clock.stop(timer);
    this.pending.delete(roomId);
    this.lastSent.delete(roomId);
  }

  /** Cancels everything queued (used when the client object is replaced). */
  close(): void {
    this.pending.forEach((timer) => this.clock.stop(timer));
    this.pending.clear();
    this.lastSent.clear();
  }

  get queued(): number {
    return this.pending.size;
  }
}
