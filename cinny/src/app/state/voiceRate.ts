/**
 * Playback speed of voice messages (#204): one choice for every voice message on this device,
 * remembered across restarts, like the speed button in other messengers.
 */
import { atomWithLocalStorage } from './utils/atomWithLocalStorage';
import { parseVoiceRate, VOICE_RATE_KEY } from '../plugins/voiceMessage';

export const voiceRateAtom = atomWithLocalStorage<number>(
  VOICE_RATE_KEY,
  (key) => {
    try {
      return parseVoiceRate(localStorage.getItem(key));
    } catch {
      return 1;
    }
  },
  (key, value) => {
    try {
      localStorage.setItem(key, String(parseVoiceRate(value)));
    } catch {
      // storage full or blocked: the speed still applies until the app closes
    }
  }
);
