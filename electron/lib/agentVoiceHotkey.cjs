// Global hotkey for "talking to an agent" (#135), Linux shell (lib/globalShortcut.cjs does the binding).
//   portal  press AND release are known, so hold-to-talk works.
//   x11     presses only, every press toggles (same as `diddy --agent-voice toggle`).
//   window  neither is possible: the page hotkey (focused window) and `diddy --agent-voice ...` remain.
const { createGlobalShortcut } = require('./globalShortcut.cjs');

const DESCRIPTION = 'Talk to an agent (Diddy)';

const createAgentVoiceHotkey = ({ trigger, ...options }) =>
  createGlobalShortcut({
    ...options,
    label: 'agent voice',
    idPrefix: 'agent-voice',
    description: DESCRIPTION,
    fallback: 'in-window hotkey and CLI',
    onKey: (down) => trigger.setKey(down),
    onPress: () => trigger.apply('toggle'),
  });

module.exports = { createAgentVoiceHotkey, DESCRIPTION };
