/**
 * Full mute ("deafen") must hold until you lift it yourself (#225). Two ways undid it unnoticed:
 * the call page reporting the microphone as on (for example when a stream starts), which counted
 * as "you unmuted, so un-deafen", and the call resetting `muted` on an audio element that Diddy
 * had muted only once. These decisions are kept here so they can be tested.
 */

/** What to do with an audio element of the call when the output state is applied. */
export type AudioMuteStep = {
  /** the deafen state now applied to the element */
  applied: boolean;
  /** the value to write to `muted`, or undefined to leave it */
  muted?: boolean;
};

/**
 * Deafened: always muted, also when something unmuted it since. Not deafened: only unmute what
 * Diddy muted for the deafen; a first sight keeps whatever the call set (per-user mute, #38).
 */
export const audioMuteStep = (
  deafened: boolean,
  appliedBefore: boolean | undefined,
  currentlyMuted: boolean
): AudioMuteStep => {
  if (deafened) return currentlyMuted ? { applied: true } : { applied: true, muted: true };
  if (appliedBefore === true) return { applied: false, muted: false };
  return { applied: false };
};

/** How a microphone state reported by the call page is taken. */
export type PageMicDecision =
  /** take the reported state as it is */
  | 'accept'
  /** you turned the microphone on while deafened: lift the deafen too (like Discord) */
  | 'undeafen'
  /** the page turned the microphone on by itself while you are deafened: switch it off again */
  | 'remute';

/**
 * `requestedOn` is the microphone state Diddy last asked the page for (undefined: never asked).
 * Only a microphone you asked for lifts the deafen; one the page switched on by itself is muted.
 */
export const pageMicDecision = (
  deafened: boolean,
  reportedOn: boolean | undefined,
  requestedOn: boolean | undefined
): PageMicDecision => {
  if (!deafened || reportedOn !== true) return 'accept';
  return requestedOn === true ? 'undeafen' : 'remute';
};
