/**
 * Whether Diddy's own output volume has to be written to a media element of the call (#142).
 *
 * Element Call / LiveKit set the per-person volume on the audio element of every remote voice.
 * A new element (the person left and came back) already carries that volume when Diddy first
 * sees it. Writing the output volume then would reset it to 100 % while the slider of the call
 * still shows the remembered level. So an element not touched before is left alone while the
 * output volume is the default (100 %); afterwards only a changed preference is written.
 */
export const shouldWriteOutputVolume = (
  appliedBefore: number | undefined,
  outputVolume: number
): boolean => (appliedBefore === undefined ? outputVolume !== 1 : appliedBefore !== outputVolume);
