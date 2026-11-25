/**
 * Why the microphone of the call does not work, for the hint above the call bar.
 *
 * Before, a microphone that failed only showed up in the log: Element Call joined without sound or
 * showed its generic error, and on Windows nobody learned that the system's privacy setting
 * ("Let desktop apps access your microphone") blocked it. The desktop app on Windows asks the
 * system each time the call opens the microphone (`microphone_access`, electron/main.cjs).
 */
import { useSyncExternalStore } from 'react';
import { diag } from '../diagnostics';
import { canInvoke, invoke } from '../tauri';

export type MicProblem =
  /** Windows' privacy settings keep desktop apps away from the microphone */
  | 'blocked'
  /** Diddy itself was refused (browser or site permission) */
  | 'denied'
  /** the device exists but does not open: another app holds it exclusively, or the driver fails */
  | 'busy'
  /** no microphone is connected */
  | 'missing'
  /** Diddy's audio processing stopped; the plain microphone is used (no noise filter, no clips) */
  | 'processing';

/** What the system answered to `microphone_access`; anything else is treated as unknown. */
export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';

/** Maps a getUserMedia() error (by name) and the system's answer to the problem to show. */
export const classifyMicError = (
  errorName: string | undefined,
  access: MicAccess = 'unknown'
): MicProblem | undefined => {
  if (access === 'denied' || access === 'restricted') return 'blocked';
  switch (errorName) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'denied';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    default:
      return undefined;
  }
};

let current: MicProblem | undefined;
const listeners = new Set<() => void>();

const set = (problem: MicProblem | undefined) => {
  if (problem === current) return;
  current = problem;
  diag(`microphone problem: ${problem ?? 'none'}`);
  listeners.forEach((l) => l());
};

export const getMicProblem = (): MicProblem | undefined => current;

export const useMicProblem = (): MicProblem | undefined =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getMicProblem
  );

export const dismissMicProblem = (): void => set(undefined);

/** Only the Windows desktop app can ask the system (Electron's getMediaAccessStatus). */
const canAskSystem = (): boolean =>
  canInvoke() && typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent);

/** The system's microphone permission for Diddy, 'unknown' where nobody can tell. */
export const askMicAccess = async (): Promise<MicAccess> => {
  if (!canAskSystem()) return 'unknown';
  try {
    const answer = await invoke<string>('microphone_access');
    return ['granted', 'denied', 'restricted', 'not-determined'].includes(answer)
      ? (answer as MicAccess)
      : 'unknown';
  } catch {
    return 'unknown';
  }
};

/** Windows only: opens Settings > Privacy & security > Microphone. */
export const canOpenMicSettings = (): boolean => canAskSystem();

export const openMicSettings = (): void => {
  invoke('open_microphone_settings').catch((e) => diag(`open microphone settings failed: ${e}`));
};

/** getUserMedia() for the call failed: find out why and show it. */
export const reportMicFailure = async (error: unknown): Promise<void> => {
  const name = error instanceof Error ? error.name : undefined;
  const access = await askMicAccess();
  diag(`microphone failed: ${name ?? String(error)} system access=${access}`);
  set(classifyMicError(name, access));
};

/**
 * The call opened the microphone. Clears an old problem, but on Windows a blocked microphone may
 * still open and deliver silence, so the system is asked too.
 */
export const reportMicOpened = async (): Promise<void> => {
  const access = await askMicAccess();
  if (access === 'denied' || access === 'restricted') {
    diag(`microphone opened, but the system blocks it (access=${access})`);
    set('blocked');
    return;
  }
  if (current !== 'processing') set(undefined);
};

/** Diddy's audio processing stopped and the plain microphone took over. */
export const reportProcessingStopped = (): void => set('processing');

/** The call ended: nothing to show any more. */
export const clearMicProblem = (): void => set(undefined);
