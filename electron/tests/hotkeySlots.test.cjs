// The page's other system-wide hotkeys (push-to-talk) by slot: same binding as agent voice, own key state.
const assert = require('node:assert/strict');
const test = require('node:test');

const { createHotkeySlots } = require('../lib/hotkeySlots.cjs');

const key = (code, mods = '') => ({
  code, ctrl: mods.includes('c'), alt: mods.includes('a'), shift: mods.includes('s'), meta: mods.includes('m'),
});

const harness = ({ env, portal = async () => ({ ok: false, reason: 'no-portal' }) }) => {
  const registered = [];
  const started = [];
  const logs = [];
  const slots = createHotkeySlots({
    env,
    globalShortcut: {
      register: (accelerator, callback) => {
        registered.push({ accelerator, callback });
        return true;
      },
      unregister: (accelerator) => registered.splice(0, registered.length, ...registered.filter((r) => r.accelerator !== accelerator)),
    },
    helper: '/h',
    helperAvailable: () => true,
    startPortal: async (options) => {
      started.push(options);
      return portal(options);
    },
    log: (line) => logs.push(line),
  });
  return { slots, registered, started, logs };
};

test('push-to-talk through the portal: press and release reach the wait, with its own shortcut id', async () => {
  const h = harness({
    env: { XDG_SESSION_TYPE: 'wayland' },
    portal: async (options) => ({ ok: true, trigger: options.trigger, stop: () => {} }),
  });
  assert.deepEqual(await h.slots.bind('push-to-talk', key('F14')), { path: 'portal', trigger: 'F14' });
  assert.equal(h.started[0].id, 'push-to-talk-f14');
  assert.equal(h.started[0].description, 'Push to talk (Diddy)');
  const waiting = h.slots.wait('push-to-talk', null, 1000);
  h.started[0].onKey(true);
  assert.deepEqual(await waiting, { key: true });
  // an answer the page has already seen waits for the next change
  const next = h.slots.wait('push-to-talk', true, 1000);
  h.started[0].onKey(false);
  assert.deepEqual(await next, { key: false });
  assert.match(h.logs.join('\n'), /push to talk: global hotkey, portal F14/);
});

test('push-to-talk where only presses are known (X11, Windows): every press flips the key', async () => {
  const h = harness({ env: {} });
  assert.deepEqual(await h.slots.bind('push-to-talk', key('KeyT', 'ca')), { path: 'x11', trigger: 'Control+Alt+T' });
  h.registered[0].callback();
  assert.deepEqual(await h.slots.wait('push-to-talk', null, 10), { key: true });
  h.registered[0].callback();
  assert.deepEqual(await h.slots.wait('push-to-talk', true, 10), { key: false });
  // unbinding releases the key and makes it unreadable again
  assert.deepEqual(await h.slots.bind('push-to-talk', undefined), { path: 'window', reason: 'none' });
  assert.equal(h.registered.length, 0);
  assert.deepEqual(await h.slots.wait('push-to-talk', false, 10), { key: null });
});

test('the wait answers with the unchanged key after the timeout', async () => {
  const h = harness({ env: {} });
  assert.deepEqual(await h.slots.wait('push-to-talk', null, 5), { key: null });
});

test('unknown slots are refused, so the page cannot register any shortcut it likes', async () => {
  const h = harness({ env: {} });
  await assert.rejects(() => h.slots.bind('anything', key('F13')), /unknown hotkey slot/);
  await assert.rejects(() => h.slots.wait('__proto__', null, 5), /unknown hotkey slot/);
  await assert.rejects(() => h.slots.wait(undefined, null, 5), /unknown hotkey slot/);
  assert.equal(h.registered.length, 0);
});
