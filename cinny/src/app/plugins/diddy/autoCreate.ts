/**
 * Creating the options room of a space by itself, so nobody has to set it up by hand.
 *
 * Only in spaces you created yourself (and may add rooms to), that have at least one other member
 * and no Diddy room yet. Each space gets at most one automatic room, ever: the spaces are kept in
 * the account data (AUTO_CREATED_EVENT) before the room is made, so a second device does not make
 * another one and a room you deleted or left does not come back. iOS uses the same event and rules
 * (`DiddyOptionsRoomLogic.swift`). Pure, no Matrix calls (tests/syncLogic.test.cjs).
 */

export const AUTO_CREATED_EVENT = 'app.diddy.auto_options_rooms';

export type AutoCreatedEntry = { at: number; roomId?: string };
export type AutoCreated = Record<string, AutoCreatedEntry>;

const MAX_SPACES = 200;

export const parseAutoCreated = (content: unknown): AutoCreated => {
  const out: AutoCreated = {};
  if (!content || typeof content !== 'object' || Array.isArray(content)) return out;
  const { spaces } = content as { spaces?: unknown };
  if (!spaces || typeof spaces !== 'object' || Array.isArray(spaces)) return out;
  Object.entries(spaces as Record<string, unknown>).forEach(([spaceId, entry]) => {
    if (!spaceId.startsWith('!') || spaceId.length > 255) return;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const { at, roomId } = entry as { at?: unknown; roomId?: unknown };
    if (typeof at !== 'number' || !Number.isFinite(at)) return;
    out[spaceId] = typeof roomId === 'string' && roomId.startsWith('!') ? { at, roomId } : { at };
  });
  return out;
};

/** The account data content with `entry` for `spaceId` (the oldest spaces are dropped past 200). */
export const autoCreatedContent = (
  current: AutoCreated,
  spaceId: string,
  entry: AutoCreatedEntry
): { v: 1; spaces: AutoCreated } => {
  const all: AutoCreated = { ...current, [spaceId]: entry };
  const kept = Object.entries(all)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_SPACES);
  return { v: 1, spaces: Object.fromEntries(kept) };
};

export type AutoCreateFacts = {
  /** you sent the space's m.room.create event */
  isCreator: boolean;
  /** you may add rooms to the space (m.space.child) */
  canAddRooms: boolean;
  joinedMembers: number;
  /** a room was already made (or is being made) for this space by one of your devices */
  claimed: boolean;
  /** undefined when the space's rooms could not be read completely */
  hasDiddyRoom: boolean | undefined;
};

export const shouldAutoCreate = (f: AutoCreateFacts): boolean =>
  f.isCreator && f.canAddRooms && f.joinedMembers >= 2 && !f.claimed && f.hasDiddyRoom === false;
