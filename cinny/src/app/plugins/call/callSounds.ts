/**
 * Short synthesized tones for mute / unmute / deafen / undeafen. Played only on this device (not
 * into the call). No audio files needed.
 */
import { getCallPrefs } from '../../state/callPrefs';
import { getSharedAudioContext } from './sharedAudio';

export type CallSound = 'mute' | 'unmute' | 'deafen' | 'undeafen';

const TONES: Record<CallSound, number[]> = {
  mute: [660, 440],
  unmute: [440, 660],
  deafen: [660, 495, 330],
  undeafen: [330, 495, 660],
};

export const playCallSound = (sound: CallSound): void => {
  if (!getCallPrefs().callSounds) return;
  try {
    const audio = getSharedAudioContext();
    const step = 0.085;
    const start = audio.currentTime + 0.01;
    TONES[sound].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = start + i * step;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + step * 0.95);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t0);
      osc.stop(t0 + step);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch {
    // sounds are optional
  }
};
