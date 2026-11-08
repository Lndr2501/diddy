/**
 * The order of a "leave this call, start that one" switch, kept free of React so it can be tested.
 *
 * Not in a call: start right away. In a call: ask first; when cancelled nothing happens at all.
 * When confirmed: hang up (best effort, a failed hangup is not fatal because `waitUntilLeft`
 * has the final say), wait until the old call is really gone, and only then start the new one.
 * If `waitUntilLeft` rejects, `start` is never called.
 */
export type SwitchCallSteps = {
  inCall: boolean;
  /** Ask the user. Only called when `inCall`. */
  confirm: () => Promise<boolean>;
  /** Called once the user confirmed, before the hangup (e.g. to show a spinner). */
  onConfirmed?: () => void;
  hangup: () => Promise<unknown> | unknown;
  waitUntilLeft: () => Promise<void>;
  start: () => Promise<void> | void;
};

/** Resolves `true` when the new call was started, `false` when the user cancelled. */
export async function runCallSwitch(steps: SwitchCallSteps): Promise<boolean> {
  if (!steps.inCall) {
    await steps.start();
    return true;
  }
  if (!(await steps.confirm())) return false;
  steps.onConfirmed?.();
  try {
    await steps.hangup();
  } catch {
    // the widget may be gone or still loading; waitUntilLeft forces the leave if needed
  }
  await steps.waitUntilLeft();
  await steps.start();
  return true;
}
