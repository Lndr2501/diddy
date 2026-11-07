/**
 * Short sounds for call events (mute, deafen, camera, stream, join/leave, ...). Played only on
 * this device, never into the call. The files and the per-sound on/off + replacement are in
 * plugins/sounds.ts.
 */
import { playSound, SoundId, startSoundLoop } from '../sounds';

export type CallSound = Extract<
  SoundId,
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'cameraOn'
  | 'cameraOff'
  | 'micChange'
  | 'disconnect'
  | 'userJoin'
  | 'userLeave'
  | 'streamStarted'
  | 'streamEnded'
  | 'callJoined'
  | 'callDeclined'
  | 'connectionLost'
>;

/**
 * A declined call or a lost connection usually ends the call right after; the leave sound (and a
 * second "bad news" sound) would only repeat the news, so they stay quiet for a moment.
 */
const FOLLOW_UPS: Partial<Record<CallSound, CallSound[]>> = {
  callDeclined: ['disconnect', 'connectionLost', 'userLeave'],
  connectionLost: ['disconnect', 'callDeclined', 'userLeave'],
};
export const FOLLOW_UP_QUIET_MS = 5000;

const quietUntil = new Map<CallSound, number>();

let stopRingbackLoop: (() => void) | undefined;

/** Stops the outgoing-call ringback, if it is playing. */
export const stopRingback = (): void => {
  stopRingbackLoop?.();
  stopRingbackLoop = undefined;
};

/** Starts the outgoing-call ringback; it loops until stopRingback(). Never plays twice at once. */
export const startRingback = (): void => {
  stopRingback();
  stopRingbackLoop = startSoundLoop('ringback');
};

export const playCallSound = (sound: CallSound, now = Date.now()): void => {
  // the call ended or broke: the ringback has served its purpose
  if (sound === 'callDeclined' || sound === 'connectionLost' || sound === 'disconnect') {
    stopRingback();
  }
  if (now < (quietUntil.get(sound) ?? 0)) return;
  FOLLOW_UPS[sound]?.forEach((next) => quietUntil.set(next, now + FOLLOW_UP_QUIET_MS));
  playSound(sound);
};
