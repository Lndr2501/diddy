/**
 * Who may write badge data as room state in an options room (#168).
 *
 * A badge's state key is its badge id (or `<badge>|<user>` for an award), not a user id, so the
 * homeserver does not tie the slot to its owner: anyone allowed to write that event type can
 * replace or empty someone else's badge, and the owner's version is gone from the room state.
 * Messages cannot be replaced like that: every sender's version stays, and the readers pick the
 * rightful one (creator tag, first writer). So only room admins write badges as state; everyone
 * else falls back to message mode automatically (see `writeDiddyData`).
 */
import { BADGE_AWARD_EVENT, BADGE_DEF_EVENT } from './types';

/** Power level needed to write badge state; the same as renaming the options room. */
export const BADGE_STATE_LEVEL = 100;

export const BADGE_EVENT_TYPES = [BADGE_DEF_EVENT, BADGE_AWARD_EVENT];

type PowerLevels = {
  events?: Record<string, number>;
  state_default?: number;
  users_default?: number;
  [key: string]: unknown;
};

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Level needed to send state of this type (Matrix default for state events is 50). */
export const stateLevelFor = (pl: PowerLevels, type: string): number =>
  num(pl.events?.[type], num(pl.state_default, 50));

/** True when an ordinary member may write badge state, which lets them overwrite other people's. */
export const badgeStateOpenToMembers = (pl: PowerLevels): boolean => {
  const member = num(pl.users_default, 0);
  return BADGE_EVENT_TYPES.some((type) => stateLevelFor(pl, type) <= member);
};

/**
 * The power levels with badge state limited to admins, or undefined when they already are.
 * Everything else in the content stays as it is.
 */
export const hardenBadgePowerLevels = (pl: PowerLevels): PowerLevels | undefined => {
  if (BADGE_EVENT_TYPES.every((type) => stateLevelFor(pl, type) >= BADGE_STATE_LEVEL))
    return undefined;
  const events = { ...(pl.events ?? {}) };
  BADGE_EVENT_TYPES.forEach((type) => {
    events[type] = Math.max(stateLevelFor(pl, type), BADGE_STATE_LEVEL);
  });
  return { ...pl, events };
};
