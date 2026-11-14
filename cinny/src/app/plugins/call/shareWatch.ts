/**
 * Screen shares only on request (#206). Somebody else's new share shows as a card
 * ("Alex is sharing their screen", Watch) instead of the picture. Until you press Watch Diddy
 * neither receives nor plays it:
 *   - picture: the share's <video> in Element Call's (invisible) tile is set to display: none.
 *     LiveKit's adaptive stream sees it is not visible and pauses the track on the server, so it
 *     is neither downloaded nor decoded. Watch shows the element again and LiveKit resumes.
 *   - sound: the share's audio publication (`screen_share_audio`) is disabled with LiveKit's
 *     `setEnabled(false)`, so the server stops forwarding it. Adaptive stream does not cover audio.
 * Your own share always shows (it is local, nothing is received). Each choice is local to you and
 * lasts while that share runs: a share that ends and starts again begins as a card again.
 *
 * Stable hooks (Element Call 0.20.1, see callStage.ts and callMute.ts):
 *   - tile `[data-testid="videoTile"][data-id="<participant identity>:screen-share"]`
 *   - LiveKit `room.remoteParticipants`, `participant.identity`,
 *     `participant.getTrackPublication("screen_share_audio")`, `publication.setEnabled()`
 */

export const SHARE_OFF_ATTR = 'data-diddy-share-off';
const STYLE_ATTR = 'data-diddy-share-watch';
export const SCREEN_SHARE_SUFFIX = ':screen-share';
export const SHARE_AUDIO_SOURCE = 'screen_share_audio';

/** A share missing from the tiles this long has ended; shorter gaps are Element Call re-drawing. */
export const SHARE_GONE_MS = 5000;

export const SHARE_WATCH_CSS = `
html body [data-testid="videoTile"][${SHARE_OFF_ATTR}] video {
  display: none !important;
}
`;

/** LiveKit identity of the participant behind a share tile id, or undefined for other ids. */
export const shareIdentity = (shareId: string): string | undefined =>
  shareId.endsWith(SCREEN_SHARE_SUFFIX) && shareId.length > SCREEN_SHARE_SUFFIX.length
    ? shareId.slice(0, -SCREEN_SHARE_SUFFIX.length)
    : undefined;

/** Your own LiveKit identities (one per SFU connection). */
export const localIdentities = (rooms: readonly { localParticipant?: unknown }[]): Set<string> => {
  const ids = new Set<string>();
  rooms.forEach((room) => {
    const id = (room.localParticipant as { identity?: unknown } | undefined)?.identity;
    if (typeof id === 'string' && id) ids.add(id);
  });
  return ids;
};

/**
 * Whether a share is your own (always shown): its identity is one of your LiveKit identities, or,
 * while no LiveKit room is reachable, it belongs to your user id.
 */
export const isOwnShare = (
  shareId: string,
  local: ReadonlySet<string>,
  userId: string | undefined
): boolean => {
  const identity = shareIdentity(shareId);
  if (!identity) return false;
  if (local.size > 0) return local.has(identity);
  return !!userId && identity.startsWith(`${userId}:`);
};

/** Which shares you chose to watch; everything else stays a card. */
export class ShareWatch {
  private listeners = new Set<() => void>();

  private watched = new Set<string>();

  /** When each share was last seen on the call. */
  private seen = new Map<string, number>();

  private snapshot: ReadonlySet<string> = new Set();

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): ReadonlySet<string> => this.snapshot;

  private emit() {
    this.snapshot = new Set(this.watched);
    this.listeners.forEach((l) => l());
  }

  public isWatched(shareId: string): boolean {
    return this.watched.has(shareId);
  }

  public watch(shareId: string, now: number = Date.now()) {
    this.seen.set(shareId, now);
    if (this.watched.has(shareId)) return;
    this.watched.add(shareId);
    this.emit();
  }

  public stop(shareId: string) {
    if (!this.watched.delete(shareId)) return;
    this.emit();
  }

  /**
   * The shares on the call now. Choices for shares gone longer than SHARE_GONE_MS are forgotten,
   * so the next share of that person starts as a card again.
   */
  public update(liveIds: Iterable<string>, now: number = Date.now()) {
    Array.from(liveIds).forEach((id) => this.seen.set(id, now));
    let changed = false;
    Array.from(this.seen.entries()).forEach(([id, at]) => {
      if (now - at <= SHARE_GONE_MS) return;
      this.seen.delete(id);
      if (this.watched.delete(id)) changed = true;
    });
    if (changed) this.emit();
  }

  /** Leaving the call: start over. */
  public clear() {
    this.seen.clear();
    if (this.watched.size === 0) return;
    this.watched.clear();
    this.emit();
  }
}

/** The choices of the call you are in (one call at a time). */
export const shareWatch = new ShareWatch();

type TileLike = {
  getAttribute: (name: string) => string | null;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

type ShareDoc = {
  querySelectorAll: (selector: string) => ArrayLike<TileLike>;
};

type PublicationLike = {
  isEnabled?: unknown;
  setEnabled?: (enabled: boolean) => void;
};

type ParticipantLike = {
  identity?: unknown;
  getTrackPublication?: (source: string) => PublicationLike | undefined;
};

export type ShareRoomLike = {
  state?: unknown;
  remoteParticipants: { values: () => Iterable<ParticipantLike> };
};

/**
 * Makes Element Call receive exactly the shares that are wanted: `wanted(shareId)` says whether a
 * share may show. Tiles of unwanted shares get SHARE_OFF_ATTR (picture paused by adaptive
 * stream), their sound is disabled on the server. Only touches what changes.
 */
export const applyShareWatch = (
  doc: ShareDoc | null | undefined,
  rooms: readonly object[],
  wanted: (shareId: string) => boolean
): void => {
  if (!doc) return;
  Array.from(doc.querySelectorAll(`[data-testid="videoTile"][data-id$="${SCREEN_SHARE_SUFFIX}"]`))
    .filter((tile) => shareIdentity(tile.getAttribute('data-id') ?? ''))
    .forEach((tile) => {
      const off = !wanted(tile.getAttribute('data-id') ?? '');
      if (off && !tile.hasAttribute(SHARE_OFF_ATTR)) tile.setAttribute(SHARE_OFF_ATTR, 'true');
      if (!off && tile.hasAttribute(SHARE_OFF_ATTR)) tile.removeAttribute(SHARE_OFF_ATTR);
    });
  (rooms as ShareRoomLike[]).forEach((room) => {
    if (room.state === 'disconnected' || typeof room.remoteParticipants?.values !== 'function') {
      return;
    }
    Array.from(room.remoteParticipants.values()).forEach((participant) => {
      const identity = String(participant?.identity ?? '');
      if (!identity) return;
      const pub = participant.getTrackPublication?.(SHARE_AUDIO_SOURCE);
      if (!pub || typeof pub.setEnabled !== 'function') return;
      const enable = wanted(`${identity}${SCREEN_SHARE_SUFFIX}`);
      if (pub.isEnabled === enable) return;
      try {
        pub.setEnabled(enable);
      } catch {
        // a publication that is being unpublished
      }
    });
  });
};

/** Puts SHARE_WATCH_CSS into the call document once. */
export const installShareWatchStyle = (doc: Document | null | undefined): void => {
  try {
    const parent = doc?.head ?? doc?.documentElement;
    if (!doc || !parent || doc.querySelector(`style[${STYLE_ATTR}]`)) return;
    const style = doc.createElement('style');
    style.setAttribute(STYLE_ATTR, 'true');
    style.textContent = SHARE_WATCH_CSS;
    parent.appendChild(style);
  } catch {
    // torn-down call document
  }
};

/** Shows every share again (the stage went away; Element Call's own view takes over). */
export const releaseShareWatch = (
  doc: ShareDoc | null | undefined,
  rooms: readonly object[]
): void => applyShareWatch(doc, rooms, () => true);
