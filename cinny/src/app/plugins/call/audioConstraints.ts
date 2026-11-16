/** voiceIsolation is not yet declared by TypeScript 4.9's DOM types. */
export type AudioProcessingConstraints = MediaTrackConstraints & {
  voiceIsolation?: ConstrainBoolean;
};

export function applyAudioProcessingPolicy(
  audio: AudioProcessingConstraints,
  processingEnabled: boolean,
  autoGain?: boolean
): AudioProcessingConstraints;
export function applyAudioProcessingPolicy(
  audio: true | AudioProcessingConstraints,
  processingEnabled: boolean,
  autoGain?: boolean
): true | AudioProcessingConstraints;
/**
 * ON leaves the caller's request unchanged. OFF explicitly disables every processing flag,
 * including WebKit's voice isolation, except automatic gain when `autoGain` asks for it
 * (Windows and Linux: many microphones are very quiet without it). Unsupported constraints may
 * still be ignored by the browser.
 */
export function applyAudioProcessingPolicy(
  audio: true | AudioProcessingConstraints,
  processingEnabled: boolean,
  autoGain = false
): true | AudioProcessingConstraints {
  if (processingEnabled) return audio;
  return {
    ...(audio === true ? {} : audio),
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: autoGain,
    voiceIsolation: false,
  };
}
