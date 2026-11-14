// "Talking to an agent" (#57), Linux shell: the external trigger `diddy --agent-voice start|stop|toggle`.
// A second launch reaches the running app through 'second-instance'. Global key state is not
// readable here (Wayland forbids it, Fn never reaches the OS), so `key` stays null and the page
// falls back to its own hotkey while focused. Same behaviour as src-tauri/src/agent_voice.rs.
// Since #135 a global shortcut (lib/agentVoiceHotkey.cjs) can report press / release through
// setKey(), or toggle the trigger; `key` is then true / false.

const COMMANDS = new Set(['start', 'stop', 'toggle']);

/** undefined: not an agent-voice launch; { error }: invalid; { command }: valid. */
const parseAgentVoiceLaunch = (argv) => {
  const index = argv.indexOf('--agent-voice');
  if (index < 0) return undefined;
  const command = argv[index + 1];
  if (!COMMANDS.has(command)) return { error: '--agent-voice expects start, stop or toggle' };
  return { command };
};

/** The longest a wait() call is held open before it answers with the unchanged state. */
const WAIT_MAX_MS = 25000;

const createAgentVoiceTrigger = () => {
  let active = false;
  let key = null;
  const waiters = new Set();
  const state = () => ({ key, trigger: active });
  const changed = () => {
    const now = state();
    waiters.forEach((resolve) => resolve(now));
    waiters.clear();
  };
  return {
    apply(command) {
      const before = active;
      if (command === 'start') active = true;
      else if (command === 'stop') active = false;
      else if (command === 'toggle') active = !active;
      if (active !== before) changed();
      return active;
    },
    /** The global shortcut is held (true) or not (false); null: cannot be read. */
    setKey(down) {
      const next = down === null ? null : !!down;
      if (next === key) return;
      key = next;
      changed();
    },
    state,
    /**
     * Answers as soon as the state differs from what the page last saw (or after `timeoutMs`), so
     * the page does not have to ask every 60 ms.
     */
    wait(seen = {}, timeoutMs = WAIT_MAX_MS) {
      const now = state();
      if (seen.key !== now.key || seen.trigger !== now.trigger) return Promise.resolve(now);
      return new Promise((resolve) => {
        const done = (value) => {
          clearTimeout(timer);
          waiters.delete(done);
          resolve(value);
        };
        const timer = setTimeout(() => done(state()), Math.min(timeoutMs, WAIT_MAX_MS));
        waiters.add(done);
      });
    },
  };
};

module.exports = { parseAgentVoiceLaunch, createAgentVoiceTrigger };
