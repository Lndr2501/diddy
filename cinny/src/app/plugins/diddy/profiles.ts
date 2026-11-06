/**
 * Reading and writing Diddy profiles and badges (see types.ts). All hooks re-render when the
 * underlying state events change.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { MatrixClient, MatrixEvent, RoomStateEvent } from 'matrix-js-sdk';
import {
  awardStateKey,
  BadgeAward,
  BadgeDef,
  BADGE_AWARD_EVENT,
  BADGE_DEF_EVENT,
  DiddyProfile,
  GLOBAL_BADGES,
  MAX_SHOWN_BADGES,
  parseAwardStateKey,
  PROFILE_EVENT,
} from './types';
import { getOptionsRooms, getPrimaryOptionsRoom } from './optionsRoom';

// --- change tracking ---------------------------------------------------------------------------

const DIDDY_EVENTS = new Set([PROFILE_EVENT, BADGE_DEF_EVENT, BADGE_AWARD_EVENT]);
let version = 0;
const listeners = new Set<() => void>();
let attachedTo: MatrixClient | undefined;
let scheduled = false;

const notify = () => {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    version += 1;
    listeners.forEach((l) => l());
  });
};

const attach = (mx: MatrixClient) => {
  if (attachedTo === mx) return;
  attachedTo?.off(RoomStateEvent.Events, onStateEvent);
  attachedTo = mx;
  mx.on(RoomStateEvent.Events, onStateEvent);
};
function onStateEvent(event: MatrixEvent) {
  if (DIDDY_EVENTS.has(event.getType())) notify();
}

const useDiddyVersion = (mx: MatrixClient): number => {
  attach(mx);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version
  );
};

// --- profiles ----------------------------------------------------------------------------------

export const readProfile = (mx: MatrixClient, userId: string): DiddyProfile | undefined => {
  const rooms = getOptionsRooms(mx);
  for (let i = 0; i < rooms.length; i += 1) {
    const content = rooms[i].currentState.getStateEvents(PROFILE_EVENT, userId)?.getContent();
    if (content && content.v === 1) return content as DiddyProfile;
  }
  return undefined;
};

/** The customization of a user, or undefined if they have none / are not on Diddy. */
export const useDiddyProfile = (mx: MatrixClient, userId: string | undefined): DiddyProfile | undefined => {
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (userId ? readProfile(mx, userId) : undefined), [mx, userId, v]);
};

export const setMyProfile = async (mx: MatrixClient, profile: DiddyProfile): Promise<void> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  await mx.sendStateEvent(room.roomId, PROFILE_EVENT as never, profile as never, mx.getSafeUserId());
};

/** Updates parts of your profile, keeping everything else. */
export const patchMyProfile = async (mx: MatrixClient, patch: Partial<DiddyProfile>): Promise<void> => {
  const current = readProfile(mx, mx.getSafeUserId()) ?? { v: 1 as const };
  await setMyProfile(mx, { ...current, ...patch, v: 1 });
};

// --- badges ------------------------------------------------------------------------------------

const readCustomBadges = (mx: MatrixClient): BadgeDef[] => {
  const defs = new Map<string, BadgeDef>();
  getOptionsRooms(mx).forEach((room) => {
    room.currentState.getStateEvents(BADGE_DEF_EVENT).forEach((event) => {
      const content = event.getContent();
      const id = event.getStateKey();
      if (id && content?.name) defs.set(id, { ...(content as BadgeDef), id });
    });
  });
  return Array.from(defs.values());
};

/** Global + custom badge definitions. */
export const useBadgeDefs = (mx: MatrixClient): BadgeDef[] => {
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => [...GLOBAL_BADGES, ...readCustomBadges(mx)], [mx, v]);
};

export type AwardedBadge = BadgeDef & { award: BadgeAward };

const readAwards = (mx: MatrixClient, userId: string, defs: BadgeDef[]): AwardedBadge[] => {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const result = new Map<string, AwardedBadge>();
  getOptionsRooms(mx).forEach((room) => {
    room.currentState.getStateEvents(BADGE_AWARD_EVENT).forEach((event) => {
      const key = parseAwardStateKey(event.getStateKey() ?? '');
      const content = event.getContent();
      if (!key || key.userId !== userId || !content?.by) return;
      const def = byId.get(key.badgeId);
      if (def) result.set(def.id, { ...def, award: content as BadgeAward });
    });
  });
  return Array.from(result.values());
};

/** All badges a user has been given. */
export const useUserBadges = (mx: MatrixClient, userId: string | undefined): AwardedBadge[] => {
  const defs = useBadgeDefs(mx);
  const v = useDiddyVersion(mx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (userId ? readAwards(mx, userId, defs) : []), [mx, userId, defs, v]);
};

/** The badges the user chose to show next to their name (only ones they really have). */
export const useShownBadges = (mx: MatrixClient, userId: string | undefined): AwardedBadge[] => {
  const profile = useDiddyProfile(mx, userId);
  const owned = useUserBadges(mx, userId);
  return useMemo(() => {
    const ids = profile?.shownBadges ?? [];
    return ids
      .map((id) => owned.find((b) => b.id === id))
      .filter((b): b is AwardedBadge => !!b)
      .slice(0, MAX_SHOWN_BADGES);
  }, [profile, owned]);
};

export const createCustomBadge = async (
  mx: MatrixClient,
  def: Omit<BadgeDef, 'id' | 'createdBy' | 'global'>
): Promise<string> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  const id = `c.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await mx.sendStateEvent(
    room.roomId,
    BADGE_DEF_EVENT as never,
    { ...def, createdBy: mx.getSafeUserId() } as never,
    id
  );
  return id;
};

export const awardBadge = async (mx: MatrixClient, badgeId: string, userId: string): Promise<void> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  const content: BadgeAward = { by: mx.getSafeUserId(), at: Date.now() };
  await mx.sendStateEvent(room.roomId, BADGE_AWARD_EVENT as never, content as never, awardStateKey(badgeId, userId));
};

export const revokeBadge = async (mx: MatrixClient, badgeId: string, userId: string): Promise<void> => {
  const room = getPrimaryOptionsRoom(mx);
  if (!room) throw new Error('No Diddy Options room found.');
  await mx.sendStateEvent(room.roomId, BADGE_AWARD_EVENT as never, {} as never, awardStateKey(badgeId, userId));
};
