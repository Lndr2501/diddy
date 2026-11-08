/**
 * What "Do not disturb" means, kept free of React and Matrix so it can be tested on its own
 * (tests/dnd.test.cjs). Like Discord: DND silences notification sounds, system notifications and
 * the incoming call ring, unread badges stay, and other people see the red DND dot.
 */
import type { DiddyStatus } from './types';

/**
 * Matrix has no DND presence, so DND is sent as "online" with this status message. Other Diddy
 * clients read it back as DND when they cannot see the Diddy profile.
 */
export const DND_STATUS_MSG = 'Do not disturb';

export type PresenceForStatus = {
  presence: 'online' | 'offline' | 'unavailable';
  statusMsg?: string;
};

/** The Matrix presence a Diddy status is announced as. */
export const presenceForStatus = (status: DiddyStatus): PresenceForStatus => {
  if (status === 'dnd') return { presence: 'online', statusMsg: DND_STATUS_MSG };
  if (status === 'idle') return { presence: 'unavailable' };
  if (status === 'invisible') return { presence: 'offline' };
  return { presence: 'online' };
};

/**
 * Your own status: the one in your Diddy profile wins, because it is synced to every device and
 * is what the status menu and the settings write. This device's copy is only the fallback for
 * accounts without a Diddy room (or before it has loaded).
 */
export const resolveMyStatus = (
  profileStatus: DiddyStatus | undefined,
  localStatus: DiddyStatus
): DiddyStatus => profileStatus ?? localStatus;

/** Whether a status silences sounds and system notifications. Badges are never silenced. */
export const silencesAlerts = (status: DiddyStatus): boolean => status === 'dnd';

/**
 * Whether someone else is shown as DND: their Diddy profile says so, or, without a profile
 * status, their Matrix status message is the DND one.
 */
export const isShownAsDnd = (
  profileStatus: DiddyStatus | undefined,
  presenceStatusMsg: string | undefined
): boolean => {
  if (profileStatus) return profileStatus === 'dnd';
  return presenceStatusMsg?.trim() === DND_STATUS_MSG;
};
