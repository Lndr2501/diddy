/** Access to the Tauri shell's commands. In a plain browser there is no shell and nothing works. */
type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
};

const getTauri = (): TauriInternals | undefined =>
  (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

export const canInvoke = (): boolean => getTauri() !== undefined;

export const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const tauri = getTauri();
  if (!tauri) throw new Error('This needs the Diddy desktop app.');
  return (await tauri.invoke(cmd, args)) as T;
};
