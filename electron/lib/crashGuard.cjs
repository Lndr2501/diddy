// Crash handling of the Electron shell: when to reload a dead renderer, and how to write errors
// to the log. macOS has the same idea in src-tauri/src/diag.rs (panic hook).

/** Renderer exit reasons after which the window is reloaded: everything except a normal exit. */
const shouldReloadAfter = (reason) => reason !== 'clean-exit';

/** Allows at most `max` events within `windowMs` (a renderer that dies on load must not loop). */
const createRateLimiter = ({ max, windowMs, now = Date.now }) => {
  let stamps = [];
  return {
    allow() {
      const t = now();
      stamps = stamps.filter((stamp) => t - stamp < windowMs);
      if (stamps.length >= max) return false;
      stamps.push(t);
      return true;
    },
  };
};

/** Text for an error or rejection reason of any type (the log writer flattens newlines). */
const describeError = (error) => {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
};

module.exports = { shouldReloadAfter, createRateLimiter, describeError };
