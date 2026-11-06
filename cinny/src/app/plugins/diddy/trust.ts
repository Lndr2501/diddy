/**
 * Trust rules for badge data, pure logic without a Matrix client (covered by cinny/tests).
 *
 * Matrix proves who SENT an event, nothing else. So every rule here is built on the sender:
 *  - A custom badge id carries a tag of its creator's user id (`c.<tag>.<time><rand>`); only that
 *    user can define it. Older ids without a tag fall back to "the oldest definition wins".
 *  - An award is kept per giver. A giver's own empty event removes their award; so can the
 *    recipient. Nobody else can overwrite or remove somebody else's award.
 */

export type Cand = { content: Record<string, unknown>; ts: number; sender?: string };

/** The newest item of every sender (items without a sender are dropped). */
export const latestPerSender = <T extends { ts: number; sender?: string }>(list: T[]): T[] => {
  const newest = new Map<string, T>();
  list.forEach((item) => {
    if (!item.sender) return;
    const known = newest.get(item.sender);
    if (!known || item.ts > known.ts) newest.set(item.sender, item);
  });
  return Array.from(newest.values());
};

// cyrb53: small, fast 53 bit string hash (not cryptographic; it only has to be hard to collide
// with by accident, a collision still needs a matching Matrix account on the same server)
const hash53 = (str: string): number => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/** 11 characters [0-9a-z] derived from the user id. */
export const ownerTag = (userId: string): string => hash53(userId).toString(36).padStart(11, '0');

const BOUND_ID = /^c\.([0-9a-z]{11})\.[0-9a-z]+$/;

export const makeBadgeId = (userId: string, now: number, rand: string): string =>
  `c.${ownerTag(userId)}.${now.toString(36)}${rand}`;

/** The creator tag of an owner-bound badge id, undefined for older ids. */
export const badgeIdOwnerTag = (id: string): string | undefined => BOUND_ID.exec(id)?.[1];

/**
 * The definition to use for a badge id out of all known versions (every sender, every source).
 * `isValid` is the content and sender check of the caller.
 */
export const pickDefinition = <T extends Cand>(
  id: string,
  candidates: T[],
  isValid: (c: T) => boolean
): T | undefined => {
  const tag = badgeIdOwnerTag(id);
  const valid = candidates
    .filter((c) => !!c.sender && isValid(c))
    .filter((c) => tag === undefined || ownerTag(c.sender as string) === tag)
    .sort((a, b) => a.ts - b.ts);
  if (valid.length === 0) return undefined;
  // older ids: the first writer owns the badge, only they may change it afterwards
  const owner = valid[0].sender;
  return valid.filter((c) => c.sender === owner).pop();
};

export type ResolvedAward = { by: string; at: number; ts: number };

/**
 * The awards of one badge for one recipient that are in force. `candidates` are all known events
 * for the key (every sender).
 */
export const resolveAwards = (recipient: string, candidates: Cand[]): ResolvedAward[] => {
  const latest = latestPerSender(candidates);
  const isAward = (c: Cand) => typeof c.content.by === 'string' && c.content.by !== '';
  // the recipient may always remove a badge they were given: their empty event ends older awards
  const recipientRemoved = latest.find((c) => c.sender === recipient && !isAward(c))?.ts;
  const result: ResolvedAward[] = [];
  latest.forEach((c) => {
    if (!isAward(c) || !c.sender) return;
    const at =
      typeof c.content.at === 'number' && Number.isFinite(c.content.at) ? c.content.at : c.ts;
    if (recipientRemoved !== undefined && recipientRemoved > at) return;
    result.push({ by: c.sender, at, ts: c.ts });
  });
  return result;
};
