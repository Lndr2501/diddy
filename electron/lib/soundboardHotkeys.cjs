// Soundboard shortcuts while Diddy is in the background, Linux / Windows shell. The page binds the
// shortcuts only while you are in a call (and "also in the background" is on), and unbinds them
// when the call ends, so the keys are free for other apps outside calls.
//   x11     Electron globalShortcut (X11 and Windows): every press plays / stops a clip. The key is
//           reserved for Diddy while bound (the focused window does not see it either).
//   window  nothing global is possible (Wayland: Chromium cannot grab keys there, and one portal
//           session per shortcut would ask the user for every clip): the in-window shortcuts remain.
// Separate from the agent voice hotkey (lib/agentVoiceHotkey.cjs); only the pure helpers of
// lib/globalHotkey.cjs are shared. Same contract as src-tauri/src/soundboard_hotkeys.rs:
//   soundboard_hotkeys_bind({ hotkeys })  -> { generation, seq, path, consumes, bound, reason? }
//   soundboard_hotkeys_wait({ after, timeoutMs }) -> { generation, seq, presses }
const { sanitizeHotkey, describeGlobal, sessionKind } = require('./globalHotkey.cjs');

const MAX_HOTKEYS = 64;
const MAX_LOG = 64;
const WAIT_MAX_MS = 25000;

const createSoundboardHotkeys = ({ env = process.env, globalShortcut, log = () => {} }) => {
  const session = sessionKind(env);
  let generation = 0;
  let seq = 0;
  /** [{ seq, index }] of the newest presses of the current binding */
  let presses = [];
  let registered = [];
  let info = { path: 'window', consumes: false, bound: [], reason: 'none' };
  const waiters = new Set();

  const wake = () => {
    waiters.forEach((done) => done());
    waiters.clear();
  };

  const unregisterAll = () => {
    registered.forEach((accelerator) => {
      try {
        globalShortcut.unregister(accelerator);
      } catch {
        // already gone
      }
    });
    registered = [];
  };

  const answer = () => ({ generation, seq, ...info });

  const bind = (value) => {
    unregisterAll();
    generation += 1;
    presses = [];
    const own = generation;
    const list = (Array.isArray(value) ? value : []).slice(0, MAX_HOTKEYS).map(sanitizeHotkey);
    if (list.length === 0) {
      info = { path: 'window', consumes: false, bound: [], reason: 'none' };
      wake();
      return answer();
    }
    if (!globalShortcut) {
      info = { path: 'window', consumes: false, bound: list.map(() => false), reason: 'unavailable' };
    } else if (session === 'wayland') {
      info = { path: 'window', consumes: false, bound: list.map(() => false), reason: 'wayland' };
    } else {
      const bound = list.map((hotkey, index) => {
        const global = hotkey ? describeGlobal(hotkey) : { reason: 'unknown-key' };
        if (!global.accelerator) return false;
        let ok = false;
        try {
          ok = globalShortcut.register(global.accelerator, () => {
            if (generation !== own) return;
            seq += 1;
            presses.push({ seq, index });
            if (presses.length > MAX_LOG) presses = presses.slice(-MAX_LOG);
            wake();
          });
        } catch (error) {
          log(`soundboard: globalShortcut.register failed: ${error.message}`);
        }
        if (ok) registered.push(global.accelerator);
        return ok;
      });
      const any = bound.some(Boolean);
      info = { path: any ? 'x11' : 'window', consumes: any, bound, reason: any ? undefined : 'register-failed' };
    }
    log(`soundboard: ${info.bound.filter(Boolean).length} of ${list.length} shortcuts global (${info.path}${info.reason ? `, ${info.reason}` : ''}) [${session}]`);
    wake();
    return answer();
  };

  /** Presses after `after` (a seq from bind or an earlier wait); waits up to `timeoutMs` for one. */
  const wait = ({ after = 0, timeoutMs = WAIT_MAX_MS } = {}) => {
    const pick = () => ({
      generation,
      seq,
      presses: presses.filter((p) => p.seq > after).map((p) => p.index),
    });
    const now = pick();
    if (now.presses.length || after > seq) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        waiters.delete(done);
        resolve(pick());
      };
      const timer = setTimeout(done, Math.max(0, Math.min(Number(timeoutMs) || 0, WAIT_MAX_MS)));
      waiters.add(done);
    });
  };

  return {
    bind,
    wait,
    info: answer,
    close() {
      unregisterAll();
      generation += 1;
      wake();
    },
  };
};

module.exports = { createSoundboardHotkeys };
