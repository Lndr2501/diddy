// One system-wide hotkey of the Linux / Windows shell (#135): picks the mechanism and keeps it alive.
// Used by agent voice (lib/agentVoiceHotkey.cjs) and the hotkey slots of the page (lib/hotkeySlots.cjs,
// push-to-talk).
//   portal  XDG Desktop Portal GlobalShortcuts through native/global-shortcut.c (Wayland, KDE, GNOME >= 48):
//           press AND release are known (onKey), so holding works.
//   x11     Electron globalShortcut (X11, Windows): presses only (onPress).
//   window  neither is possible: only the page's own hotkey (focused window) remains.
// The chosen path and the reason for a fallback are logged and reported to the settings page.
const { describeGlobal, sessionKind, planPaths, shortcutId, knownReason } = require('./globalHotkey.cjs');

const createGlobalShortcut = ({
  env = process.env,
  /** log prefix, e.g. 'agent voice' */
  label,
  /** prefix of the portal shortcut id, e.g. 'agent-voice' */
  idPrefix,
  /** shown by the desktop for the shortcut */
  description,
  /** the key went down (true) or up (false); false also when the shortcut goes away */
  onKey,
  /** a press where only presses are known (x11) */
  onPress,
  /** what the fallback leaves, for the log */
  fallback = 'in-window hotkey',
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
    const detail = next.path === 'window' ? `fallback: ${fallback} (${next.reason})` : `${next.path}${next.trigger ? ` ${next.trigger}` : ''}`;
    log(`${label}: global hotkey, ${detail} [${session}]`);
  };

  const release = () => {
    const active = current;
    current = undefined;
    if (!active) return;
    active.stop();
    // A key still held when the shortcut goes away must not stay "down" in the page.
    onKey(false);
  };

  const attempt = async (path, global, id, own) => {
    if (path === 'portal') {
      const result = await startPortal({
        command: helper,
        id,
        trigger: global.portal,
        description,
        onKey: (down) => {
          if (generation === own) onKey(down);
        },
        onEnd: (reason) => {
          if (generation !== own) return;
          current = undefined;
          onKey(false);
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
      registered = globalShortcut.register(global.accelerator, () => onPress());
    } catch (error) {
      log(`${label}: globalShortcut.register failed: ${error.message}`);
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
      const result = await attempt(path, global, global.portal ? shortcutId(global.portal, idPrefix) : '', own);
      if (result.stale) return;
      if (result.info) {
        setInfo(result.info);
        return;
      }
      lastReason = result.reason;
      log(`${label}: ${path} hotkey not available: ${result.reason}`);
      if (generation !== own) return;
    }
    setInfo({ path: 'window', reason: knownReason(lastReason) });
  };

  return {
    /** Binds `hotkey` (sanitized page hotkey or undefined to unbind). Calls are serialized; the newest wins. */
    bind(hotkey) {
      const own = ++generation;
      queue = queue.then(() => doBind(hotkey, own)).catch((error) => {
        log(`${label}: global hotkey failed: ${error.message}`);
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

module.exports = { createGlobalShortcut };
