// Push-to-talk: the state machine (held sources, release delay, full mute, agent voice), when the
// microphone state is (re)sent, which key presses count, and clashes with the agent voice key.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const load = (file, requires = {}) => {
  const filename = path.join(__dirname, '../src/app', file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      require: (id) => {
        if (!(id in requires)) throw new Error(`Unexpected import: ${id}`);
        return requires[id];
      },
    },
    { filename }
  );
  return exports;
};

const ptt = load('plugins/call/pushToTalk.ts');
const hotkey = load('plugins/agentVoice/hotkey.ts');

/** Fake timers: run() fires everything due up to `ms` from now. */
const clock = () => {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    timers: {
      set: (run, ms) => {
        const id = next++;
        pending.set(id, { run, at: now + ms });
        return id;
      },
      clear: (id) => pending.delete(id),
    },
    advance(ms) {
      now += ms;
      [...pending.entries()]
        .filter(([, t]) => t.at <= now)
        .forEach(([id, t]) => {
          pending.delete(id);
          t.run();
        });
    },
    get pending() {
      return pending.size;
    },
  };
};

const machine = (delay = 200) => {
  const c = clock();
  const changes = [];
  const m = new ptt.PushToTalk({
    timers: c.timers,
    releaseDelayMs: () => delay,
    onChange: (open) => changes.push(open),
  });
  return { m, c, changes };
};

test('holding opens, letting go closes after the release delay', () => {
  const { m, c, changes } = machine(200);
  assert.equal(m.isOpen, false);
  m.setHeld('key', true);
  assert.equal(m.isOpen, true);
  m.setHeld('key', false);
  assert.equal(m.isOpen, true, 'still open during the delay');
  c.advance(199);
  assert.equal(m.isOpen, true);
  c.advance(1);
  assert.equal(m.isOpen, false);
  assert.deepEqual(changes, [true, false]);
});

test('pressing again during the release delay keeps it open without a flicker', () => {
  const { m, c, changes } = machine(300);
  m.setHeld('key', true);
  m.setHeld('key', false);
  c.advance(100);
  m.setHeld('key', true);
  c.advance(1000);
  assert.equal(m.isOpen, true);
  m.setHeld('key', false);
  c.advance(300);
  assert.equal(m.isOpen, false);
  assert.deepEqual(changes, [true, false]);
});

test('no delay closes at once; key, system key and button add up', () => {
  const { m, c, changes } = machine(0);
  m.setHeld('key', true);
  m.setHeld('system', true);
  m.setHeld('key', false);
  assert.equal(m.isOpen, true, 'the system reading still holds it');
  m.setHeld('button', true);
  m.setHeld('system', false);
  assert.equal(m.isOpen, true);
  m.setHeld('button', false);
  assert.equal(m.isOpen, false);
  assert.equal(c.pending, 0);
  assert.deepEqual(changes, [true, false]);
});

test('full mute wins: it never opens and closes at once, without the delay', () => {
  const { m, c, changes } = machine(500);
  m.setFullMuted(true);
  m.setHeld('key', true);
  assert.equal(m.isOpen, false, 'holding does not lift the full mute');
  m.setFullMuted(false);
  assert.equal(m.isOpen, true, 'you lifted it yourself while holding: talking');
  m.setFullMuted(true);
  assert.equal(m.isOpen, false, 'closed at once');
  assert.equal(c.pending, 0);
  m.setHeld('key', false);
  m.setFullMuted(false);
  assert.equal(m.isOpen, false, 'nothing held any more');
  assert.deepEqual(changes, [true, false]);
});

test('full mute during the release delay closes at once', () => {
  const { m, c } = machine(500);
  m.setHeld('key', true);
  m.setHeld('key', false);
  m.setFullMuted(true);
  assert.equal(m.isOpen, false);
  c.advance(500);
  assert.equal(m.isOpen, false);
});

test('talking to an agent keeps it closed, the dictation stays out of the call', () => {
  const { m } = machine(200);
  m.setHeld('key', true);
  m.setBlocked(true);
  assert.equal(m.isOpen, false);
  m.setBlocked(false);
  assert.equal(m.isOpen, true);
});

test('reset forgets the held keys and closes', () => {
  const { m, c, changes } = machine(200);
  m.setHeld('button', true);
  m.reset();
  assert.equal(m.isOpen, false);
  assert.equal(m.isHeld, false);
  c.advance(1000);
  assert.deepEqual(changes, [true, false]);
});

test('release delay is clamped to 0-500 ms', () => {
  assert.equal(ptt.clampReleaseDelay(150), 150);
  assert.equal(ptt.clampReleaseDelay(-5), 0);
  assert.equal(ptt.clampReleaseDelay(9000), 500);
  assert.equal(ptt.clampReleaseDelay(99.6), 100);
  assert.equal(ptt.clampReleaseDelay('300'), ptt.DEFAULT_RELEASE_DELAY_MS);
  assert.equal(ptt.clampReleaseDelay(NaN), ptt.DEFAULT_RELEASE_DELAY_MS);
  // a long delay from storage cannot keep the microphone open for long
  const { m, c } = machine(60000);
  m.setHeld('key', true);
  m.setHeld('key', false);
  c.advance(500);
  assert.equal(m.isOpen, false);
});

test('the microphone state is sent on a change, and again only when the call disagrees a moment later', () => {
  assert.equal(ptt.shouldSendMic(true, false, undefined, 0, 0), true, 'first time');
  assert.equal(ptt.shouldSendMic(true, false, true, 1000, 1100), false, 'answer still on its way');
  assert.equal(ptt.shouldSendMic(true, false, true, 1000, 1000 + ptt.MIC_RESEND_MS), true, 'lost or undone');
  assert.equal(ptt.shouldSendMic(true, true, true, 0, 5000), false, 'agrees');
  assert.equal(ptt.shouldSendMic(false, true, true, 1000, 1001), true, 'let go before the answer');
  assert.equal(ptt.shouldSendMic(false, true, false, 0, 5000), true, 'page switched it on by itself');
});

test('a plain typing key does not count while typing in a field', () => {
  const k = (code, mods = {}) => ({ code, ctrl: false, alt: false, meta: false, ...mods });
  assert.equal(ptt.pageKeyCounts(k('KeyV'), true), false);
  assert.equal(ptt.pageKeyCounts(k('KeyV'), false), true);
  assert.equal(ptt.pageKeyCounts(k('Backquote'), true), false);
  assert.equal(ptt.pageKeyCounts(k('KeyV', { ctrl: true }), true), true);
  assert.equal(ptt.pageKeyCounts(k('F13'), true), true);
  assert.equal(ptt.pageKeyCounts(k('AltRight'), true), true);
  assert.equal(ptt.pageKeyCounts(undefined, false), false);
});

test('push-to-talk and agent voice on the same key are a clash', () => {
  const k = (code, mods = {}) => ({ code, ctrl: false, alt: false, shift: false, meta: false, ...mods });
  assert.equal(hotkey.hotkeysClash(k('AltRight'), k('AltRight')), true);
  assert.equal(hotkey.hotkeysClash(k('KeyK', { ctrl: true }), k('KeyK', { ctrl: true })), true);
  assert.equal(hotkey.hotkeysClash(k('KeyK', { ctrl: true }), k('KeyK', { alt: true })), false);
  assert.equal(hotkey.hotkeysClash(k('F13'), k('F13', { ctrl: true })), true, 'macOS reads F13 whatever the modifiers');
  assert.equal(hotkey.hotkeysClash(k('F13'), k('F14')), false);
  assert.equal(hotkey.hotkeysClash(undefined, k('F14')), false);
});

test('the settings search finds push to talk', () => {
  const search = load('features/settings/settingsSearch.ts');
  const pages = (q) =>
    Object.keys(search.SETTINGS_SEARCH_INDEX).filter((key) =>
      search.entryMatches(search.SETTINGS_SEARCH_INDEX[key], q)
    );
  assert.deepEqual(pages('push to talk'), ['calls']);
  assert.deepEqual(pages('ptt'), ['calls']);
  assert.deepEqual(pages('release delay'), ['calls']);
  assert.ok(search.matchingTitles(search.SETTINGS_SEARCH_INDEX.calls, 'push').includes('Push to talk'));
});
