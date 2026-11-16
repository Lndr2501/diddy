// System-wide hotkeys of the page besides agent voice, one per named slot (push-to-talk; a new
// feature adds its slot to SLOTS). Each slot binds its key through lib/globalShortcut.cjs and keeps
// the key state the page waits for, like agent voice does (`hotkey_bind`, `hotkey_wait`):
//   portal  press and release reach the page, holding works;
//   x11     only presses are known (X11, Windows): every press flips the key, so press = start,
//           next press = stop.
// Unknown slots are refused, so the page cannot make the shell register arbitrary shortcuts.
const { createGlobalShortcut } = require('./globalShortcut.cjs');
const { createAgentVoiceTrigger } = require('./agentVoice.cjs');

const SLOTS = {
  'push-to-talk': { description: 'Push to talk (Diddy)', label: 'push to talk' },
};

const createHotkeySlots = ({ slots = SLOTS, ...shortcutOptions }) => {
  const entries = new Map();

  const entry = (slot) => {
    if (typeof slot !== 'string' || !Object.prototype.hasOwnProperty.call(slots, slot)) {
      throw new Error(`unknown hotkey slot: ${String(slot).slice(0, 32)}`);
    }
    let found = entries.get(slot);
    if (!found) {
      // the agent voice state without its trigger: a key (null until bound) and a wait for changes
      const keys = createAgentVoiceTrigger();
      const binding = createGlobalShortcut({
        ...shortcutOptions,
        label: slots[slot].label,
        idPrefix: slot,
        description: slots[slot].description,
        onKey: (down) => keys.setKey(down),
        onPress: () => keys.setKey(!keys.state().key),
      });
      found = { keys, binding };
      entries.set(slot, found);
    }
    return found;
  };

  return {
    /** Binds `hotkey` (sanitized) for `slot`, or unbinds with undefined. Answers like agent voice's bind. */
    async bind(slot, hotkey) {
      const { keys, binding } = entry(slot);
      const info = await binding.bind(hotkey);
      // not bound: the page cannot read the key from here
      if (info.path === 'window') keys.setKey(null);
      return info;
    },
    /** Answers `{ key }` once the key differs from `lastKey`, or after `timeoutMs`. */
    async wait(slot, lastKey, timeoutMs) {
      const { keys } = entry(slot);
      const state = await keys.wait({ key: lastKey ?? null, trigger: false }, timeoutMs);
      return { key: state.key };
    },
    close() {
      entries.forEach(({ binding }) => binding.close());
    },
  };
};

module.exports = { createHotkeySlots, SLOTS };
