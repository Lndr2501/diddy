/**
 * Keeps a person in the "speaking" set for a short time after they stop (#flicker). LiveKit's
 * active-speaker flag switches off and on between words, which made the small avatars in the
 * sidebar flash while somebody talked. Your own microphone already has such a hold
 * (voiceActivity.ts); this does the same for everybody in the call.
 *
 * Pure logic, no timers: the caller asks `expiresIn` when to look again.
 */

/** How long somebody still counts as speaking after the last moment the call said so. */
export const SPEAKER_HOLD_MS = 600;

export type SpeakerHold = {
  /** Feed who is speaking now (at `now` ms); returns who counts as speaking. Same Set while unchanged. */
  update: (current: ReadonlySet<string>, now: number) => Set<string>;
  /** Ms until the next held person lets go, or undefined when nobody is only being held. */
  expiresIn: (now: number) => number | undefined;
};

export const createSpeakerHold = (holdMs = SPEAKER_HOLD_MS): SpeakerHold => {
  const lastSeen = new Map<string, number>();
  let result = new Set<string>();
  return {
    update(current, now) {
      current.forEach((id) => lastSeen.set(id, now));
      const next = new Set<string>();
      lastSeen.forEach((seen, id) => {
        if (current.has(id) || now - seen < holdMs) next.add(id);
        else lastSeen.delete(id);
      });
      const same = next.size === result.size && Array.from(next).every((id) => result.has(id));
      if (!same) result = next;
      return result;
    },
    expiresIn(now) {
      let soonest: number | undefined;
      lastSeen.forEach((seen) => {
        const left = holdMs - (now - seen);
        if (left > 0 && (soonest === undefined || left < soonest)) soonest = left;
      });
      return soonest;
    },
  };
};
