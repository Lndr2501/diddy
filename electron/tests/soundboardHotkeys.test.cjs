const test = require('node:test');
const assert = require('node:assert/strict');
const { createSoundboardHotkeys } = require('../lib/soundboardHotkeys.cjs');

const key = (code, mods = {}) => ({ code, ctrl: false, alt: false, shift: false, meta: false, ...mods });

test('only binds during call and releases registrations; each press has one index', async () => {
  const callbacks = new Map();
  const shell = createSoundboardHotkeys({ env: { XDG_SESSION_TYPE: 'x11' }, globalShortcut: {
    register: (accelerator, callback) => { callbacks.set(accelerator, callback); return true; },
    unregister: (accelerator) => { callbacks.delete(accelerator); },
  } });
  const info = shell.bind([key('KeyA', { ctrl: true }), key('KeyB', { alt: true })]);
  assert.equal(info.path, 'x11');
  assert.equal(info.bound.length, 2);
  assert.equal(callbacks.size, 2);
  callbacks.values().next().value();
  const press = await shell.wait({ after: info.seq, timeoutMs: 1 });
  assert.deepEqual(press.presses, [0]);
  shell.bind([]);
  assert.equal(callbacks.size, 0);
  shell.close();
});

test('Wayland does not grab shortcuts; bad keys never bind', () => {
  let calls = 0;
  const register = () => { calls += 1; return true; };
  const wayland = createSoundboardHotkeys({ env: { XDG_SESSION_TYPE: 'wayland' }, globalShortcut: { register, unregister() {} } });
  assert.equal(wayland.bind([key('KeyA', { ctrl: true })]).path, 'window');
  assert.equal(calls, 0);
  const x11 = createSoundboardHotkeys({ env: { XDG_SESSION_TYPE: 'x11' }, globalShortcut: { register, unregister() {} } });
  assert.equal(x11.bind([key('Unidentified')]).bound[0], false);
  assert.equal(calls, 0);
});
