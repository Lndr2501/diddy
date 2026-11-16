/**
 * Hotkeys the desktop app reads while Diddy is in the background, for features other than agent
 * voice (push-to-talk; more can use their own slot). Same mechanism as agent voice (#57, #135):
 * - macOS (Tauri): the app reads the key from the system (Fn, modifiers, F13-F20 alone) and
 *   answers `hotkey_wait` when it changes;
 * - Linux / Windows (Electron): the page asks the app to bind the key system-wide for a slot
 *   (`hotkey_bind`: portal with press and release, or a global shortcut that only sees presses,
 *   where every press flips the key), then waits for it the same way.
 * An older app without these commands: nothing happens, the key works while the window is focused.
 */
import { AgentHotkey, canReadNatively, GlobalHotkeyInfo, parseGlobalHotkeyInfo } from './agentVoice/hotkey';
import { canInvoke, invoke } from './tauri';
import { diag } from './diagnostics';
import { isMacOS } from '../utils/user-agent';

export type SystemHotkeySlot = 'push-to-talk';

const WAIT_MS = 25000;

type WatchOptions = {
  slot: SystemHotkeySlot;
  hotkey: AgentHotkey | undefined;
  /** Linux / Windows: bind the key system-wide (it is then reserved for Diddy) */
  bind: boolean;
  onKey: (down: boolean) => void;
  /** Linux / Windows: how the key is bound, undefined when it is not */
  onInfo?: (info: GlobalHotkeyInfo | undefined) => void;
};

/** Starts watching; the returned function stops it (and unbinds). */
export const watchSystemHotkey = ({ slot, hotkey, bind, onKey, onInfo }: WatchOptions): (() => void) => {
  if (!canInvoke() || !hotkey) return () => undefined;
  const mac = isMacOS();
  // macOS reads only some keys; Linux / Windows only what was bound
  if (mac ? !canReadNatively(hotkey) : !bind) return () => undefined;

  let stopped = false;
  let lastKey: boolean | null = null;
  const loop = async () => {
    while (!stopped) {
      let raw: unknown;
      try {
        // eslint-disable-next-line no-await-in-loop
        raw = await invoke('hotkey_wait', { slot, key: hotkey.code, lastKey, timeoutMs: WAIT_MS });
      } catch (error) {
        diag(`hotkey ${slot}: system key unavailable: ${String(error)}`);
        return;
      }
      if (stopped) return;
      const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).key : null;
      const key = typeof value === 'boolean' ? value : null;
      if (key !== null && key !== lastKey) onKey(key);
      lastKey = key;
    }
  };

  const start = async () => {
    if (!mac) {
      try {
        const info = parseGlobalHotkeyInfo(await invoke('hotkey_bind', { slot, hotkey }));
        if (stopped) return;
        onInfo?.(info);
        if (!info || info.path === 'window') return;
      } catch (error) {
        diag(`hotkey ${slot}: global key unavailable: ${String(error)}`);
        onInfo?.(undefined);
        return;
      }
    }
    loop();
  };
  start();

  return () => {
    stopped = true;
    if (lastKey) onKey(false);
    if (!mac) {
      invoke('hotkey_bind', { slot, hotkey: null }).catch(() => undefined);
      onInfo?.(undefined);
    }
  };
};
