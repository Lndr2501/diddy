// Automatic message deletion per room (#245): the standard m.room.retention state event (MSC1763).
// The homeserver purges expired messages; Diddy hides them right away, because the server only
// purges every few minutes. Cases shared with iOS and Android: docs/fixtures/retention.json.

export const RETENTION_EVENT = 'm.room.retention';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The lifetimes the room settings offer; the server allows 1 hour to 365 days. */
export const RETENTION_CHOICES: readonly number[] = [HOUR, DAY, 7 * DAY, 30 * DAY];

/** How long messages stay in the room (ms), or undefined when the room keeps its history. */
export const retentionLifetime = (content: unknown): number | undefined => {
  if (!content || typeof content !== 'object') return undefined;
  const value = (content as { max_lifetime?: unknown }).max_lifetime;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const lifetime = Math.floor(value);
  return lifetime > 0 ? lifetime : undefined;
};

/** The state event content for a choice; an empty content turns automatic deletion off. */
export const retentionContent = (lifetime: number | undefined): Record<string, number> =>
  lifetime ? { max_lifetime: lifetime } : {};

/** Whether a message sent at `ts` is past the room's lifetime. Unknown times never expire. */
export const isExpired = (ts: number, lifetime: number | undefined, now: number): boolean =>
  lifetime !== undefined && ts > 0 && now - ts >= lifetime;

export type RetentionLabel = { unit: 'days' | 'hours' | 'minutes'; count: number };

/** A lifetime in whole days or hours where possible, otherwise in (rounded up) minutes. */
export const retentionLabel = (lifetime: number): RetentionLabel => {
  if (lifetime % DAY === 0) return { unit: 'days', count: lifetime / DAY };
  if (lifetime % HOUR === 0) return { unit: 'hours', count: lifetime / HOUR };
  return { unit: 'minutes', count: Math.ceil(lifetime / MINUTE) };
};
