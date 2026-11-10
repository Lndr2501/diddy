// Global hotkey for "talking to an agent" (#135), Linux shell: picks the mechanism and keeps it alive.
//   portal  XDG Desktop Portal GlobalShortcuts through native/global-shortcut.c (Wayland, KDE, GNOME >= 48):
//           press AND release are known, so hold-to-talk works.
//   x11     Electron globalShortcut: presses only, every press toggles (same as `diddy --agent-voice toggle`).
//   window  neither is possible: the page hotkey (focused window) and `diddy --agent-voice ...` remain.
// The chosen path and the reason for a fallback are logged and reported to the settings page.
const { describeGlobal, sessionKind, planPaths, shortcutId, knownReason } = require('./globalHotkey.cjs');

const DESCRIPTION = 'Talk to an agent (Diddy)';

const createAgentVoiceHotkey = ({
  env = process.env,
  trigger,
  globalShortcut,
  helper,
  helperAvailable = () => true,
  startPortal,
  log = () => {},
}) => {
  const session = sessionKind(env);
  let info = { path: 'window', reason: 'none' };
  let current;
  let generation = 0;
  let queue = Promise.resolve();

  const setInfo = (next) => {
    info = next;
    const detail = next.path === 'window' ? `fallback: in-window hotkey and CLI (${next.reason})` : `${next.path}${next.trigger ? ` ${next.trigger}` : ''}`;
    log(`agent voice: global hotkey, ${detail} [${session}]`);
  };

  const release = () => {
    const active = current;
    current = undefined;
    if (!active) return;
    active.stop();
    // A key still held when the shortcut goes away must not stay "down" in the page.
    trigger.setKey(false);
  };

  const attempt = async (path, global, id, own) => {
    if (path === 'portal') {
      const result = await startPortal({
        command: helper,
        id,
        trigger: global.portal,
        description: DESCRIPTION,
        onKey: (down) => {
          if (generation === own) trigger.setKey(down);
        },
        onEnd: (reason) => {
          if (generation !== own) return;
          current = undefined;
          trigger.setKey(false);
          setInfo({ path: 'window', reason });
        },
      });
      if (!result.ok) return { reason: result.reason };
      if (generation !== own) {
        result.stop();
        return { stale: true };
      }
      current = { stop: result.stop };
      return { info: { path: 'portal', trigger: result.trigger || global.portal } };
    }
    let registered = false;
    try {
      registered = globalShortcut.register(global.accelerator, () => trigger.apply('toggle'));
    } catch (error) {
      log(`agent voice: globalShortcut.register failed: ${error.message}`);
    }
    if (!registered) return { reason: 'register-failed' };
    current = { stop: () => globalShortcut.unregister(global.accelerator) };
    return { info: { path: 'x11', trigger: global.accelerator } };
  };

  const doBind = async (hotkey, own) => {
    release();
    if (generation !== own) return;
    const global = describeGlobal(hotkey);
    const paths = planPaths({
      session,
      global,
      helperAvailable: helperAvailable(),
      globalShortcutAvailable: !!globalShortcut,
    });
    if (!paths.length) {
      let reason = global.reason;
      if (!reason) reason = global.portal && !helperAvailable() ? 'no-helper' : 'unavailable';
      setInfo({ path: 'window', reason: knownReason(reason) });
      return;
    }
    let lastReason = 'unavailable';
    for (const path of paths) {
      const result = await attempt(path, global, global.portal ? shortcutId(global.portal) : '', own);
      if (result.stale) return;
      if (result.info) {
        setInfo(result.info);
        return;
      }
      lastReason = result.reason;
      log(`agent voice: ${path} hotkey not available: ${result.reason}`);
      if (generation !== own) return;
    }
    setInfo({ path: 'window', reason: knownReason(lastReason) });
  };

  return {
    /** Binds `hotkey` (sanitized page hotkey or undefined to unbind). Calls are serialized; the newest wins. */
    bind(hotkey) {
      const own = ++generation;
      queue = queue.then(() => doBind(hotkey, own)).catch((error) => {
        log(`agent voice: global hotkey failed: ${error.message}`);
        if (generation === own) setInfo({ path: 'window', reason: 'unavailable' });
      });
      return queue.then(() => info);
    },
    info: () => info,
    close() {
      generation += 1;
      release();
    },
  };
};

module.exports = { createAgentVoiceHotkey, DESCRIPTION };
