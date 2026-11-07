/** Writes a line to the app's diagnostics log (desktop app only), otherwise to the console. */
import { canInvoke, invoke } from './tauri';

export const diag = (message: string): void => {
  if (!canInvoke()) {
    // eslint-disable-next-line no-console
    console.debug('[diag]', message);
    return;
  }
  invoke('diag_log', { line: message }).catch(() => undefined);
};

const clip = (text: unknown, max = 300): string =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, max);

/**
 * Writes uncaught JavaScript errors to the app log (message and place only, truncated), so a bug
 * report with the log file shows what went wrong. Call once at startup.
 */
export const installErrorLogging = (): void => {
  window.addEventListener('error', (evt) => {
    diag(`js error: ${clip(evt.message)} at ${clip(evt.filename, 120)}:${evt.lineno}:${evt.colno}`);
  });
  window.addEventListener('unhandledrejection', (evt) => {
    const reason = evt.reason as { message?: unknown } | string | undefined;
    diag(
      `js unhandled rejection: ${clip(
        typeof reason === 'string' ? reason : reason?.message ?? reason
      )}`
    );
  });
};
