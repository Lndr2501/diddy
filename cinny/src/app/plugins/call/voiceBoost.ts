/** LiveKit's existing Web Audio gain supplies levels above HTMLMediaElement's 100 % limit. */
import { getSharedAudioContext } from './sharedAudio';

type AudioTrack = {
  source: string;
  attachedElements: HTMLMediaElement[];
  audioContext?: AudioContext;
  elementVolume?: number;
  gainNode?: GainNode;
  setAudioContext: (context: AudioContext) => void;
};
type Boost = { track: AudioTrack; volume: number; output: number; deafened: boolean };
const boosted = new WeakMap<HTMLMediaElement, Boost>();

const apply = (state: Boost) => {
  const { track, volume, output, deafened } = state;
  track.gainNode?.gain.setTargetAtTime(deafened ? 0 : volume * output, 0, 0.01);
  track.attachedElements.forEach((element) => {
    const el = element;
    // Only the Web Audio path plays. Keep the original element silent after deafen/unmute too.
    el.volume = 0;
    el.muted = true;
    boosted.set(el, state);
  });
};

export const applyBoostOutput = (
  el: HTMLMediaElement,
  output: number,
  deafened: boolean
): boolean => {
  const state = boosted.get(el);
  if (!state) return false;
  state.output = output;
  state.deafened = deafened;
  apply(state);
  return true;
};

export const installVoiceBoost = (
  win: Window | null,
  prefs: () => { outputVolume: number },
  isDeafened: () => boolean
): void => {
  if (!win) return;
  const target = win as Window & {
    __diddyTrackVolume?: (track: AudioTrack, volume: number) => boolean;
  };
  target.__diddyTrackVolume = (audioTrack, requested) => {
    const track = audioTrack;
    // Screen shares keep their existing playback path and 0–100 % range.
    if (track.source !== 'microphone') return false;
    const previous = track.attachedElements.map((el) => boosted.get(el)).find(Boolean);
    if (requested <= 1 && !previous && !track.audioContext) return false;
    const volume = Number.isFinite(requested) ? Math.min(2, Math.max(0, requested)) : 1;
    track.elementVolume = volume;
    if (!track.audioContext) track.setAudioContext(getSharedAudioContext());
    apply({ track, volume, output: prefs().outputVolume, deafened: isDeafened() });
    return true;
  };
};
