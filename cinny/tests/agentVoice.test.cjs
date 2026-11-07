// Hardware-free tests for "talking to an agent" (#57): hotkey matching, hold / toggle,
// microphone handling of the session, messages from other call members.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dir = path.join(__dirname, '../src/app/plugins/agentVoice');
const cache = {};
const load = (name) => {
  if (cache[name]) return cache[name];
  const filename = path.join(dir, `${name}.ts`);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const exports = {};
  cache[name] = exports;
  vm.runInNewContext(
    compiled,
    {
      exports,
      require: (id) => {
        if (!id.startsWith('./')) throw new Error(`Unexpected import: ${id}`);
        return load(id.slice(2));
      },
    },
    { filename }
  );
  return exports;
};

const hotkey = load('hotkey');
const session = load('session');
const remote = load('remote');

const key = (code, mods = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

test('records single keys, combinations and lone modifiers', () => {
  assert.deepEqual(
    { ...hotkey.hotkeyFromEvent(key('F13')) },
    {
      code: 'F13',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    }
  );
  // a modifier alone ignores its own flag (AltRight keyup/keydown carries altKey)
  assert.deepEqual(
    { ...hotkey.hotkeyFromEvent(key('AltRight', { altKey: true })) },
    {
      code: 'AltRight',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    }
  );
  assert.equal(hotkey.hotkeyFromEvent(key('Space', { ctrlKey: true, shiftKey: true })).ctrl, true);
  // keys that would break typing are refused
  for (const code of ['Escape', 'Tab', 'Enter', 'Backspace', 'Space', 'CapsLock', '']) {
    assert.equal(hotkey.hotkeyFromEvent(key(code)), undefined, code);
  }
});

test('press needs the exact modifiers, repeats are ignored, release needs the main key', () => {
  const combo = hotkey.hotkeyFromEvent(key('Space', { ctrlKey: true }));
  assert.equal(hotkey.matchesPress(combo, key('Space', { ctrlKey: true })), true);
  assert.equal(hotkey.matchesPress(combo, key('Space')), false);
  assert.equal(hotkey.matchesPress(combo, key('Space', { ctrlKey: true, shiftKey: true })), false);
  assert.equal(hotkey.matchesPress(combo, key('Space', { ctrlKey: true, repeat: true })), false);
  assert.equal(hotkey.matchesRelease(combo, key('Space')), true);
  assert.equal(hotkey.matchesRelease(combo, key('ControlLeft')), false);

  const lone = hotkey.hotkeyFromEvent(key('AltRight'));
  assert.equal(hotkey.matchesPress(lone, key('AltRight', { altKey: true, shiftKey: true })), true);
  assert.equal(hotkey.matchesPress(lone, key('AltLeft', { altKey: true })), false);
  assert.equal(hotkey.matchesPress(undefined, key('AltRight')), false);
});

test('labels, native support and stored values', () => {
  const combo = { code: 'Space', ctrl: true, alt: false, shift: true, meta: false };
  assert.equal(hotkey.formatHotkey(combo, false), 'Ctrl + Shift + Space');
  assert.equal(
    hotkey.formatHotkey(
      { code: 'AltRight', ctrl: false, alt: false, shift: false, meta: false },
      true
    ),
    'Right Option'
  );
  assert.equal(
    hotkey.formatHotkey({ code: 'Fn', ctrl: false, alt: false, shift: false, meta: false }, true),
    'Fn / Globe'
  );
  assert.equal(
    hotkey.formatHotkey({ code: 'KeyD', ctrl: false, alt: true, shift: false, meta: false }, true),
    'Option + D'
  );
  assert.equal(hotkey.formatHotkey(undefined, true), 'Not set');

  assert.equal(
    hotkey.canReadNatively({ code: 'Fn', ctrl: false, alt: false, shift: false, meta: false }),
    true
  );
  assert.equal(hotkey.canReadNatively(combo), false);
  const single = (code) => ({ code, ctrl: false, alt: false, shift: false, meta: false });
  assert.equal(hotkey.canReadNatively(single('AltRight')), true);
  assert.equal(hotkey.canReadNatively(single('F18')), true);
  // ordinary keys would need Input Monitoring: page only
  assert.equal(hotkey.canReadNatively(single('KeyA')), false);
  assert.equal(hotkey.canReadNatively(undefined), false);

  assert.deepEqual(
    { ...hotkey.parseHotkey({ code: 'F14', ctrl: 1 }) },
    {
      code: 'F14',
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    }
  );
  assert.equal(hotkey.parseHotkey({ code: '<script>' }), undefined);
  assert.equal(hotkey.parseHotkey('F14'), undefined);
  assert.equal(hotkey.parseHotkey(null), undefined);
});

test('hold mode follows page and system readings together', () => {
  const gate = new hotkey.HotkeyGate('hold');
  assert.equal(gate.setPageKey(true), true);
  // the system sees the same key: still one press
  assert.equal(gate.setNativeKey(true), true);
  assert.equal(gate.setPageKey(false), true);
  assert.equal(gate.setNativeKey(false), false);
  // focus lost: only the page reading is dropped
  gate.setNativeKey(true);
  gate.setPageKey(true);
  assert.equal(gate.releasePageKey(), true);
  assert.equal(gate.setNativeKey(false), false);
});

test('toggle mode flips once per physical press', () => {
  const gate = new hotkey.HotkeyGate('toggle');
  assert.equal(gate.setPageKey(true), true);
  assert.equal(gate.setNativeKey(true), true); // same press seen twice
  assert.equal(gate.setPageKey(false), true);
  assert.equal(gate.setNativeKey(false), true); // release does nothing
  assert.equal(gate.setNativeKey(true), false); // second press ends it
  gate.setNativeKey(false);
  gate.setPageKey(true);
  gate.setMode('hold'); // changing the mode starts from scratch
  assert.equal(gate.active, false);
});

function sessionSetup({ muteMic = true, live = true } = {}) {
  const timers = new Map();
  let now = 0;
  let nextId = 1;
  const changes = [];
  const mic = {
    live,
    sets: [],
    isLive() {
      return this.live;
    },
    setLive(value) {
      this.sets.push(value);
      this.live = value;
    },
  };
  const ctx = { mic, mute: muteMic };
  const s = new session.AgentVoiceSession({
    timers: {
      set: (run, ms) => {
        const id = nextId++;
        timers.set(id, { at: now + ms, run });
        return id;
      },
      clear: (id) => timers.delete(id),
    },
    getMic: () => ctx.mic,
    muteMic: () => ctx.mute,
    onActiveChange: (active) => changes.push(active),
  });
  const advance = (ms) => {
    now += ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      if (!due.length) return;
      const [id, timer] = due[0];
      timers.delete(id);
      timer.run();
    }
  };
  return { s, mic, ctx, changes, advance };
}

test('mutes while talking to the agent and unmutes after the release delay', () => {
  const { s, mic, changes, advance } = sessionSetup();
  s.set('hotkey', true);
  assert.equal(s.isActive, true);
  assert.deepEqual(mic.sets, [false]);
  s.set('hotkey', false);
  advance(session.RELEASE_DELAY_MS - 1);
  assert.equal(s.isActive, true);
  // pressed again within the delay: one continuous session
  s.set('hotkey', true);
  advance(session.RELEASE_DELAY_MS * 2);
  s.set('hotkey', false);
  advance(session.RELEASE_DELAY_MS);
  assert.equal(s.isActive, false);
  assert.deepEqual(mic.sets, [false, true]);
  assert.deepEqual(changes, [true, false]);
});

test('never unmutes a microphone it did not mute, nor a different call', () => {
  // already muted by the user: stays muted afterwards
  let t = sessionSetup({ live: false });
  t.s.set('hotkey', true);
  t.s.reset();
  assert.deepEqual(t.mic.sets, []);

  // the setting is off: the microphone is not touched, the status still changes
  t = sessionSetup({ muteMic: false });
  t.s.set('hotkey', true);
  t.s.reset();
  assert.deepEqual(t.mic.sets, []);
  assert.deepEqual(t.changes, [true, false]);

  // unmuted by hand in the meantime: nothing to restore
  t = sessionSetup();
  t.s.set('hotkey', true);
  t.mic.live = true;
  t.s.reset();
  assert.deepEqual(t.mic.sets, [false]);

  // left the call and joined another one: the new call's microphone is not touched
  t = sessionSetup();
  t.s.set('trigger', true);
  const other = { live: false, sets: [], isLive: () => false, setLive: (v) => other.sets.push(v) };
  t.ctx.mic = other;
  t.s.set('trigger', false);
  t.advance(session.RELEASE_DELAY_MS);
  assert.deepEqual(other.sets, []);

  // no call at all
  t = sessionSetup();
  t.ctx.mic = undefined;
  t.s.set('hotkey', true);
  t.s.reset();
  assert.deepEqual(t.changes, [true, false]);
});

test('hotkey and trigger combine; a forgotten start ends after the safety timeout', () => {
  const { s, changes, advance } = sessionSetup();
  s.set('trigger', true);
  s.set('hotkey', true);
  s.set('trigger', false);
  advance(session.RELEASE_DELAY_MS * 3);
  assert.equal(s.isActive, true); // hotkey still held
  advance(session.MAX_ACTIVE_MS);
  assert.equal(s.isActive, false);
  assert.deepEqual(changes, [true, false]);
});

test('remote state: only the call room, newest message wins, expiry and members', () => {
  let now = 1000;
  const r = new remote.RemoteAgentVoices(() => now);
  const room = '!call:example.org';
  const msg = (active, ts, roomId = room) =>
    remote.parseAgentPayload({ room_id: roomId, active, ts });

  assert.equal(r.receive('@a:x', msg(true, 10, '!other:x'), room), false);
  assert.equal(r.receive('@a:x', msg(true, 10), room), true);
  assert.deepEqual([...r.users()], ['@a:x']);
  // older message arriving late is ignored
  assert.equal(r.receive('@a:x', msg(false, 9), room), false);
  assert.deepEqual([...r.users()], ['@a:x']);
  assert.equal(r.receive('@a:x', msg(false, 11), room), true);
  assert.deepEqual([...r.users()], []);

  r.receive('@b:x', msg(true, 1), room);
  r.receive('@c:x', msg(true, 1), room);
  assert.equal(r.prune(new Set(['@b:x', '@c:x'])), false);
  assert.equal(r.prune(new Set(['@b:x'])), true); // @c left the call
  assert.deepEqual([...r.users()], ['@b:x']);
  now += session.MAX_ACTIVE_MS;
  assert.equal(r.prune(), true); // a lost "stopped" message does not stick
  assert.deepEqual([...r.users()], []);
});

test('payload and native state validation', () => {
  assert.equal(remote.parseAgentPayload({ room_id: 'room', active: true, ts: 1 }), undefined);
  assert.equal(remote.parseAgentPayload({ room_id: '!r:x', active: 'yes', ts: 1 }), undefined);
  assert.equal(
    remote.parseAgentPayload({ room_id: '!r:x', active: true, ts: Infinity }),
    undefined
  );
  assert.equal(remote.parseAgentPayload(null), undefined);
  assert.equal(remote.parseAgentPayload({ room_id: '!r:x', active: true, ts: 5 }).active, true);

  assert.deepEqual(
    { ...remote.parseNativeState({ key: true, trigger: false }) },
    { key: true, trigger: false }
  );
  assert.deepEqual(
    { ...remote.parseNativeState({ key: null, trigger: true }) },
    { key: null, trigger: true }
  );
  assert.equal(remote.parseNativeState({ key: true }), undefined);
  assert.equal(remote.parseNativeState(undefined), undefined);
});
