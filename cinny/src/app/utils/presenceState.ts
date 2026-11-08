/**
 * The one place that decides which online state a user is shown with (#72, #73).
 *
 * Two signals exist: the Matrix presence (online, unavailable, offline, plus a status message)
 * and the status the user picked in Diddy (online, idle, dnd, invisible), stored in their
 * profile. Diddy publishes "do not disturb" as Matrix presence "online" with the status message
 * below, so a view that only read the Matrix presence showed DND users as online while the
 * profile card showed them as DND. Every view (DM list, room header, member list, profile card)
 * goes through resolvePresenceState so they always agree.
 *
 * Kept free of imports so the unit tests can load it on its own.
 */

export type PresenceState = 'online' | 'idle' | 'dnd' | 'offline';

/** Same values as DiddyStatus in plugins/diddy/types. */
export type ChosenStatus = 'online' | 'idle' | 'dnd' | 'invisible';

/** The Matrix status message Diddy publishes while a user is on "Do not disturb". */
export const DND_STATUS_MSG = 'Do not disturb';

export type PresenceInput = {
  /** Matrix presence: "online", "unavailable" or "offline" */
  presence?: string;
  /** Matrix status message */
  statusMsg?: string;
  /** 0 or missing while no presence was ever received for the user (or the server has none) */
  lastActiveTs?: number;
  /** the status the user picked in Diddy, from their profile */
  chosen?: ChosenStatus;
};

export const PRESENCE_STATE_LABEL: Record<PresenceState, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Offline',
};

/** folds color names, so badges and dots use the same color for the same state. */
export const PRESENCE_STATE_COLOR: Record<
  PresenceState,
  'Success' | 'Warning' | 'Critical' | 'Secondary'
> = {
  online: 'Success',
  idle: 'Warning',
  dnd: 'Critical',
  offline: 'Secondary',
};

const isDndMessage = (statusMsg: string | undefined): boolean =>
  statusMsg?.trim().toLowerCase() === DND_STATUS_MSG.toLowerCase();

/**
 * The state to show, or undefined when nothing is known about the user's presence (then no
 * view should claim online or offline).
 *
 * - Matrix presence decides whether the user is connected at all: offline stays offline, even
 *   if an older profile still says "dnd".
 * - While connected, the picked status refines it: invisible shows as offline, dnd as do not
 *   disturb (also recognized from the status message when the profile is not readable), idle
 *   or Matrix "unavailable" as idle.
 */
export const resolvePresenceState = (
  input: PresenceInput | undefined
): PresenceState | undefined => {
  if (!input) return undefined;
  const { presence, statusMsg, lastActiveTs, chosen } = input;
  if (presence !== 'online' && presence !== 'unavailable' && presence !== 'offline') {
    return undefined;
  }
  if (presence === 'offline') return lastActiveTs ? 'offline' : undefined;
  if (chosen === 'invisible') return 'offline';
  if (chosen === 'dnd' || isDndMessage(statusMsg)) return 'dnd';
  if (presence === 'unavailable' || chosen === 'idle') return 'idle';
  return 'online';
};

/** The user's own status message, without the marker Diddy uses for "do not disturb". */
export const presenceMessage = (statusMsg: string | undefined): string | undefined => {
  const message = statusMsg?.trim();
  if (!message || isDndMessage(message)) return undefined;
  return message;
};

/** True for every state in which the user is reachable in some way (not offline or unknown). */
export const isPresentState = (state: PresenceState | undefined): boolean =>
  state !== undefined && state !== 'offline';
