// "Talking to an agent" (#57), Linux shell: the external trigger `diddy --agent-voice start|stop|toggle`.
// A second launch reaches the running app through 'second-instance'. Global key state is not
// readable here (Wayland forbids it, Fn never reaches the OS), so `key` is always null and the page
// falls back to its own hotkey while focused. Same behaviour as src-tauri/src/agent_voice.rs.

const COMMANDS = new Set(['start', 'stop', 'toggle']);

/** undefined: not an agent-voice launch; { error }: invalid; { command }: valid. */
const parseAgentVoiceLaunch = (argv) => {
  const index = argv.indexOf('--agent-voice');
  if (index < 0) return undefined;
  const command = argv[index + 1];
  if (!COMMANDS.has(command)) return { error: '--agent-voice expects start, stop or toggle' };
  return { command };
};

const createAgentVoiceTrigger = () => {
  let active = false;
  return {
    apply(command) {
      if (command === 'start') active = true;
      else if (command === 'stop') active = false;
      else if (command === 'toggle') active = !active;
      return active;
    },
    state: () => ({ key: null, trigger: active }),
  };
};

module.exports = { parseAgentVoiceLaunch, createAgentVoiceTrigger };
