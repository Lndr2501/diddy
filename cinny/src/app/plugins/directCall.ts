// Calling someone straight from their profile card (#55): pick the existing private chat
// (direct room) with that person, so the call rings only them and not a whole room.

/**
 * The room to call `userId` in: the first room in the `m.direct` account data for that user that
 * we are still in. `undefined` when there is none (a chat has to be created first).
 */
export function findDirectRoomId(
  directContent: unknown,
  userId: string,
  isJoined: (roomId: string) => boolean
): string | undefined {
  if (!directContent || typeof directContent !== 'object') return undefined;
  const rooms = (directContent as Record<string, unknown>)[userId];
  if (!Array.isArray(rooms)) return undefined;
  return rooms.find((id): id is string => typeof id === 'string' && isJoined(id));
}

/** The call options of the profile's "Call" button: voice only, mic and sound on. */
export const PROFILE_CALL_PREFERENCES = {
  microphone: true,
  video: false,
  sound: true,
} as const;
