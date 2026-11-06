/** voiceIsolation is not yet declared by TypeScript 4.9's DOM types. */
export type AudioProcessingConstraints = MediaTrackConstraints & {
  voiceIsolation?: ConstrainBoolean;
};

export function applyAudioProcessingPolicy(
  audio: AudioProcessingConstraints,
  processingEnabled: boolean
): AudioProcessingConstraints;
export function applyAudioProcessingPolicy(
  audio: true | AudioProcessingConstraints,
  processingEnabled: boolean
): true | AudioProcessingConstraints;
/**
 * ON leaves the caller's request unchanged. OFF explicitly disables every processing flag,
 * including WebKit's voice isolation. Unsupported constraints may still be ignored by the browser.
 */
export function applyAudioProcessingPolicy(
  audio: true | AudioProcessingConstraints,
  processingEnabled: boolean
): true | AudioProcessingConstraints {
  if (processingEnabled) return audio;
  return {
    ...(audio === true ? {} : audio),
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: false,
  };
}
