/**
 * How many of the newest timeline events count as "recent": the first backfill page, i.e. half of
 * the window a client reads when it starts, so recent data does not fall out of it any time soon.
 */
export const RECENT_WINDOW_EVENTS = 150;

export type AnnounceChannel = 'profile' | 'badges';
const CHANNELS: AnnounceChannel[] = ['profile', 'badges'];

/**
 * Avoids re-sending on every app start. A send that is due only because this client came online
 * leaves out every own entry that is still among the newest RECENT_WINDOW_EVENTS of the room AND is
 * newer than the join of every member: all of them already received it. A join of another member
 * (or our own join) always sends everything, because a new member cannot read the old events.
 */
export class RecentOwnData {
  /** roomId -> type/key -> timestamp of our newest event among the newest events of the room */
  private recent = new Map<string, Map<string, number>>();

  private scanned = new Set<string>();

  private onlineOnly = new Map<AnnounceChannel, Set<string>>(
    CHANNELS.map((c) => [c, new Set<string>()])
  );

  /** An own event of `type`/`key` was seen among the newest events of the room. */
  noteRecent(roomId: string, type: string, key: string, ts: number): void {
    let keys = this.recent.get(roomId);
    if (!keys) {
      keys = new Map();
      this.recent.set(roomId, keys);
    }
    const id = `${type}\u0000${key}`;
    keys.set(id, Math.max(ts, keys.get(id) ?? 0));
  }

  /** The newest events of the room were read completely (backfill finished). */
  markScanned(roomId: string): void {
    this.scanned.add(roomId);
  }

  /** The next send of this room is due only because this client came online. */
  comingOnline(roomId: string): void {
    CHANNELS.forEach((c) => this.onlineOnly.get(c)?.add(roomId));
  }

  /** A join happened: the next send of this room must contain everything. */
  needEverything(roomId: string): void {
    CHANNELS.forEach((c) => this.onlineOnly.get(c)?.delete(roomId));
  }

  /** Reads and clears the online-only flag of one channel. */
  takeOnlineOnly(roomId: string, channel: AnnounceChannel): boolean {
    return this.onlineOnly.get(channel)?.delete(roomId) ?? false;
  }

  /**
   * True when the entry is among the newest events of a completely read room and was sent after
   * `lastJoinTs` (the newest join of another member), so every member already has it.
   */
  isRecent(roomId: string, type: string, key: string, lastJoinTs: number): boolean {
    if (!this.scanned.has(roomId)) return false;
    const ts = this.recent.get(roomId)?.get(`${type}\u0000${key}`);
    return ts !== undefined && ts > lastJoinTs;
  }

  forget(roomId: string): void {
    this.recent.delete(roomId);
    this.scanned.delete(roomId);
    this.needEverything(roomId);
  }

  clear(): void {
    this.recent.clear();
    this.scanned.clear();
    CHANNELS.forEach((c) => this.onlineOnly.get(c)?.clear());
  }
}
