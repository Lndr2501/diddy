/**
 * Short sounds for call events (mute, deafen, camera, stream, join/leave, ...). Played only on
 * this device, never into the call. The files and the per-sound on/off + replacement are in
 * plugins/sounds.ts.
 */
import { playSound, SoundId } from '../sounds';

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
>;

export const playCallSound = (sound: CallSound): void => {
  playSound(sound);
};
