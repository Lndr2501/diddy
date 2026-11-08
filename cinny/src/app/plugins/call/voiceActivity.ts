/**
 * Voice activity of your own microphone, from its level (#76).
 *
 * Element Call only marks a tile as speaking when the layout asks for speaking indicators (never in
 * a one-on-one call) and when the LiveKit server reports the person as an active speaker. Your own
 * ring therefore stayed off while others had one. Diddy hears your microphone itself (it hands the
 * track to the call), so it decides from the level whether you are talking.
 *
 * Pure logic, no Web Audio: localSpeaking.ts feeds it with analyser samples.
 */

/** Level (RMS, dBFS) at which you count as talking. */
export const SPEAKING_START_DB = -45;
/** Below this level the voice has stopped (a little lower: no flicker around the threshold). */
export const SPEAKING_STOP_DB = -52;
/** You keep counting as talking this long after the last loud moment (pauses between words). */
export const SPEAKING_HOLD_MS = 450;

/** Silence (and a muted or disabled microphone) in dBFS. */
export const SILENCE_DB = -100;

type SamplesLike = { length: number; [index: number]: number };

/** RMS level of the samples in dBFS (SILENCE_DB for silence or no samples). */
export const levelDb = (samples: SamplesLike): number => {
  if (samples.length === 0) return SILENCE_DB;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sum += s * s;
  }
  const rms = Math.sqrt(sum / samples.length);
  if (!(rms > 0)) return SILENCE_DB;
  return Math.max(SILENCE_DB, 20 * Math.log10(rms));
};

export type VoiceActivity = {
  /** Feed one level reading (dBFS) taken at `now` (ms). Returns whether you are talking. */
  update: (db: number, now: number) => boolean;
  /** Forget the state (microphone muted or gone). */
  reset: () => void;
  readonly speaking: boolean;
};

export const createVoiceActivity = (
  startDb = SPEAKING_START_DB,
  stopDb = SPEAKING_STOP_DB,
  holdMs = SPEAKING_HOLD_MS
): VoiceActivity => {
  let speaking = false;
  let lastLoud = -Infinity;
  return {
    update(db, now) {
      if (db >= startDb || (speaking && db >= stopDb)) {
        speaking = true;
        lastLoud = now;
      } else if (speaking && now - lastLoud > holdMs) {
        speaking = false;
      }
      return speaking;
    },
    reset() {
      speaking = false;
      lastLoud = -Infinity;
    },
    get speaking() {
      return speaking;
    },
  };
};
