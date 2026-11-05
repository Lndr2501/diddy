/** Writes a line to the app's diagnostics log (desktop app only), otherwise to the console. */
import { canInvoke, invoke } from './tauri';

export const diag = (message: string): void => {
  if (!canInvoke()) {
    // eslint-disable-next-line no-console
    console.debug('[diag]', message);
    return;
  }
  invoke('diag_log', { line: message }).catch(() => {});
};
