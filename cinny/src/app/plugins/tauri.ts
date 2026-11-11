/** Access to the Tauri shell's commands. In a plain browser there is no shell and nothing works. */
type TauriInternals = {
  invoke: (
    cmd: string,
    args?: Record<string, unknown> | Uint8Array,
    options?: { headers?: Record<string, string> }
  ) => Promise<unknown>;
};

const getTauri = (): TauriInternals | undefined =>
  (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;

export const canInvoke = (): boolean => getTauri() !== undefined;

export const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
  const tauri = getTauri();
  if (!tauri) throw new Error('This needs the Diddy desktop app.');
  return (await tauri.invoke(cmd, args)) as T;
};

/**
 * Lets the user choose where to save `text` (the system "Save as" window), then writes it there.
 * Returns the chosen path, or `undefined` when the window was cancelled. The chosen file is
 * allowed for writing by the dialog itself, so no broad file access is needed.
 */
export const saveTextFileAs = async (
  defaultName: string,
  text: string,
  filter: { name: string; extensions: string[] }
): Promise<string | undefined> => {
  const tauri = getTauri();
  if (!tauri) throw new Error('This needs the Diddy desktop app.');
  const chosen = (await tauri.invoke('plugin:dialog|save', {
    options: { defaultPath: defaultName, filters: [filter] },
  })) as string | null;
  if (!chosen) return undefined;
  await tauri.invoke('plugin:fs|write_file', new TextEncoder().encode(text), {
    headers: { path: encodeURIComponent(chosen), options: '{}' },
  });
  return chosen;
};
