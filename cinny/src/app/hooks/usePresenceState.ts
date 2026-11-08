import { useMemo } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { useUserPresence } from './useUserPresence';
import { useDiddyProfile } from '../plugins/diddy/profiles';
import { PresenceState, presenceMessage, resolvePresenceState } from '../utils/presenceState';

export type ShownPresence = {
  state: PresenceState;
  /** the user's own status message, if any */
  message?: string;
};

/**
 * The online state every view shows for a user (DM list, room header, member list, profile
 * card): Matrix presence combined with the status picked in Diddy. Undefined while unknown.
 */
export const usePresenceState = (userId: string | undefined): ShownPresence | undefined => {
  const mx = useMatrixClient();
  const presence = useUserPresence(userId);
  const chosen = useDiddyProfile(mx, userId)?.status;

  return useMemo(() => {
    if (!presence) return undefined;
    const state = resolvePresenceState({
      presence: presence.presence,
      statusMsg: presence.status,
      lastActiveTs: presence.lastActiveTs,
      chosen,
    });
    if (!state) return undefined;
    return { state, message: presenceMessage(presence.status) };
  }, [presence, chosen]);
};
