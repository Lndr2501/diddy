/**
 * Output volume preference x per-person volume of the call (#142).
 *
 * Every remote audio element carries the volume you gave that person (LiveKit sets it when the
 * element is attached, Diddy restores it for a returning person: userVolume.ts). The output
 * volume of Diddy's audio settings used to be written over it on first sight of an element, so
 * the slider of a returning person stood at their remembered level while the real volume was
 * back at the output volume.
 *
 * The output volume is now a factor on top of the person's level, and is not written at all while
 * it is 100 % (the default) and nothing changed.
 */

export type OutputVolumeRecord = {
  /** the output volume that is applied to the element now */
  output: number;
  /** the person's own level, without the output factor */
  user: number;
  /** the last value written to element.volume (a different value means the call changed it) */
  written: number;
};

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export type OutputVolumeStep = {
  record: OutputVolumeRecord;
  /** the value to write to element.volume, or undefined when nothing has to be written */
  write: number | undefined;
};

/**
 * @param record what was applied to this element before (undefined on first sight)
 * @param elementVolume element.volume right now
 * @param outputVolume the output volume preference, 0 to 1
 */
export const nextElementVolume = (
  record: OutputVolumeRecord | undefined,
  elementVolume: number,
  outputVolume: number
): OutputVolumeStep => {
  const output = clamp(outputVolume);
  const current = clamp(elementVolume);
  if (!record) {
    // first sight: the element holds the person's own level, scale it only if needed
    if (output === 1) return { record: { output, user: current, written: current }, write: undefined };
    const target = clamp(current * output);
    return { record: { output, user: current, written: target }, write: target };
  }
  // the call (the person's slider) changed the volume since we wrote it: that is the new level
  const user = current !== record.written ? current : record.user;
  if (output === record.output) {
    // nothing of ours changed; keep the call's value and remember it
    return { record: { output, user, written: current }, write: undefined };
  }
  const target = clamp(user * output);
  return { record: { output, user, written: target }, write: target };
};
