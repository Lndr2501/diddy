// Run from electron/: node --test tests/*.test.cjs
// Global hotkey for agent voice (#135): conversion, signal mapping, fallback decision, helper process wrapper,
// and (when cc, GIO and dbus-daemon exist, e.g. on the Mac and in Linux CI) the real helper against a fake portal.
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const hk = require('../lib/globalHotkey.cjs');
const { startPortalShortcut } = require('../lib/portalShortcut.cjs');
const { createAgentVoiceHotkey } = require('../lib/agentVoiceHotkey.cjs');
const { createAgentVoiceTrigger } = require('../lib/agentVoice.cjs');

const key = (code, mods = '') => ({
  code, ctrl: mods.includes('c'), alt: mods.includes('a'), shift: mods.includes('s'), meta: mods.includes('m'),
});

test('page hotkey -> portal trigger (XDG shortcuts spec) and Electron accelerator', () => {
  assert.deepEqual(hk.describeGlobal(key('F13')), { portal: 'F13', accelerator: 'F13' });
  assert.deepEqual(hk.describeGlobal(key('Space', 'ca')), { portal: 'CTRL+ALT+space', accelerator: 'Control+Alt+Space' });
  assert.deepEqual(hk.describeGlobal(key('KeyK', 'csm')), { portal: 'CTRL+SHIFT+LOGO+k', accelerator: 'Control+Shift+Super+K' });
  assert.deepEqual(hk.describeGlobal(key('Digit7', 'a')), { portal: 'ALT+7', accelerator: 'Alt+7' });
  assert.deepEqual(hk.describeGlobal(key('Backquote', 'c')), { portal: 'CTRL+grave', accelerator: 'Control+`' });
  assert.deepEqual(hk.describeGlobal(key('PageDown', 'c')), { portal: 'CTRL+Page_Down', accelerator: 'Control+PageDown' });
  assert.deepEqual(hk.describeGlobal(key('Numpad3', 'c')), { portal: 'CTRL+KP_3', accelerator: 'Control+num3' });
  // Pause exists for the portal only
  assert.deepEqual(hk.describeGlobal(key('Pause')), { portal: 'Pause', accelerator: undefined });
});

test('hotkeys that cannot be global say why', () => {
  assert.equal(hk.describeGlobal(undefined).reason, 'none');
  for (const code of ['AltRight', 'ShiftLeft', 'MetaLeft', 'ControlRight', 'Fn']) {
    assert.equal(hk.describeGlobal(key(code)).reason, 'modifier-only', code);
  }
  assert.equal(hk.describeGlobal(key('KeyA')).reason, 'needs-modifier');
  assert.equal(hk.describeGlobal(key('KeyA', 's')).reason, 'needs-modifier');
  assert.equal(hk.describeGlobal(key('F5')).reason, 'needs-modifier');
  assert.equal(hk.describeGlobal(key('Foo')).reason, 'unknown-key');
  assert.ok(hk.describeGlobal(key('F5', 'c')).portal);
});

test('page input is validated', () => {
  assert.equal(hk.sanitizeHotkey(null), undefined);
  assert.equal(hk.sanitizeHotkey({ code: 'a b' }), undefined);
  assert.equal(hk.sanitizeHotkey({ code: 'x'.repeat(30) }), undefined);
  assert.deepEqual(hk.sanitizeHotkey({ code: 'F13', ctrl: 'yes', alt: true }), key('F13', 'a'));
});

test('session kind and fallback decision', () => {
  assert.equal(hk.sessionKind({ XDG_SESSION_TYPE: 'wayland' }), 'wayland');
  assert.equal(hk.sessionKind({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }), 'wayland');
  assert.equal(hk.sessionKind({ XDG_SESSION_TYPE: 'x11', WAYLAND_DISPLAY: 'x' }), 'x11');
  assert.equal(hk.sessionKind({ DISPLAY: ':0' }), 'x11');
  assert.equal(hk.sessionKind({}), 'unknown');
  const both = { portal: 'F13', accelerator: 'F13' };
  const plan = (session, global, helperAvailable = true, globalShortcutAvailable = true) =>
    hk.planPaths({ session, global, helperAvailable, globalShortcutAvailable });
  assert.deepEqual(plan('wayland', both), ['portal']); // Chromium cannot grab keys on Wayland
  assert.deepEqual(plan('x11', both), ['portal', 'x11']);
  assert.deepEqual(plan('x11', both, false), ['x11']);
  assert.deepEqual(plan('wayland', both, false), []);
  assert.deepEqual(plan('x11', { portal: 'Pause' }), ['portal']);
  assert.deepEqual(plan('x11', both, true, false), ['portal']);
  assert.deepEqual(plan('unknown', {}), []);
});

test('helper lines map to press / release / bound / error', () => {
  assert.deepEqual(hk.parseHelperLine('down'), { type: 'down' });
  assert.deepEqual(hk.parseHelperLine('up\r'), { type: 'up' });
  assert.deepEqual(hk.parseHelperLine('bound Ctrl+F13'), { type: 'bound', trigger: 'Ctrl+F13' });
  assert.deepEqual(hk.parseHelperLine('bound '), { type: 'bound', trigger: '' });
  assert.deepEqual(hk.parseHelperLine('error denied'), { type: 'error', code: 'denied' });
  assert.equal(hk.parseHelperLine('error Bad Code!'), undefined);
  assert.equal(hk.parseHelperLine('hello'), undefined);
  assert.equal(hk.parseHelperLine('bound ' + 'x'.repeat(500)).trigger.length, 64);
  assert.equal(hk.knownReason('denied'), 'denied');
  assert.equal(hk.knownReason('<script>'), 'unavailable');
  // the trigger is part of the id: the portal ignores a new preferred trigger for a known id
  assert.equal(hk.shortcutId('CTRL+ALT+space'), 'agent-voice-ctrl-alt-space');
});

test('agent voice trigger carries the global key state', () => {
  const trigger = createAgentVoiceTrigger();
  assert.deepEqual(trigger.state(), { key: null, trigger: false });
  trigger.setKey(true);
  assert.deepEqual(trigger.state(), { key: true, trigger: false });
  trigger.setKey(false);
  assert.equal(trigger.state().key, false);
  trigger.setKey(null);
  assert.equal(trigger.state().key, null);
});

// ---- helper process wrapper with a fake process ----------------------------------------------

const fakeChild = () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.killed = [];
  child.kill = (signal) => {
    child.killed.push(signal);
    setImmediate(() => child.emit('exit', null, signal));
  };
  return child;
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('portal helper: bound, press / release, stop', async () => {
  const child = fakeChild();
  const calls = [];
  const keys = [];
  const promise = startPortalShortcut({
    command: '/x/helper', id: 'agent-voice-f13', trigger: 'F13', description: 'Talk',
    onKey: (down) => keys.push(down), onEnd: () => keys.push('end'),
    spawnProcess: (...args) => { calls.push(args); return child; },
  });
  assert.deepEqual(calls[0].slice(0, 2), ['/x/helper', ['agent-voice-f13', 'F13', 'Talk']]);
  child.stdout.write('down\n'); // before "bound": ignored
  child.stdout.write('bound F13 (desk');
  child.stdout.write('top)\ndown\nup\ndo');
  child.stdout.write('wn\n');
  const result = await promise;
  assert.equal(result.ok, true);
  assert.equal(result.trigger, 'F13 (desktop)');
  await tick();
  assert.deepEqual(keys, [true, false, true]);
  result.stop();
  await tick();
  assert.deepEqual(child.killed, ['SIGTERM']);
  assert.deepEqual(keys, [true, false, true]); // a stop is not "ended by the desktop"
});

test('portal helper: errors, missing binary, crash, timeout', async () => {
  let child = fakeChild();
  let promise = startPortalShortcut({ command: 'h', id: 'i', trigger: 'F13', description: 'd', spawnProcess: () => child });
  child.stdout.write('error denied\n');
  assert.deepEqual(await promise, { ok: false, reason: 'denied' });

  child = fakeChild();
  promise = startPortalShortcut({ command: 'h', id: 'i', trigger: 'F13', description: 'd', spawnProcess: () => child });
  child.emit('error', Object.assign(new Error('spawn h ENOENT'), { code: 'ENOENT' }));
  assert.deepEqual(await promise, { ok: false, reason: 'no-helper' });

  child = fakeChild();
  promise = startPortalShortcut({ command: 'h', id: 'i', trigger: 'F13', description: 'd', spawnProcess: () => child });
  child.emit('exit', 1, null);
  assert.deepEqual(await promise, { ok: false, reason: 'exited' });

  child = fakeChild();
  promise = startPortalShortcut({ command: 'h', id: 'i', trigger: 'F13', description: 'd', timeoutMs: 20, spawnProcess: () => child });
  assert.deepEqual(await promise, { ok: false, reason: 'timeout' });
  assert.deepEqual(child.killed, ['SIGTERM']);

  assert.deepEqual(
    await startPortalShortcut({ command: 'h', id: 'i', trigger: 'F13', description: 'd', spawnProcess: () => { throw new Error('boom'); } }),
    { ok: false, reason: 'no-helper' }
  );
});

test('portal helper: the desktop closing the session ends the shortcut', async () => {
  const child = fakeChild();
  const ends = [];
  const promise = startPortalShortcut({
    command: 'h', id: 'i', trigger: 'F13', description: 'd', onEnd: (reason) => ends.push(reason), spawnProcess: () => child,
  });
  child.stdout.write('bound x\n');
  await promise;
  child.stdout.write('error closed\n');
  await tick();
  assert.deepEqual(ends, ['closed']);
});

// ---- orchestration: which path is used, fallback, key state -----------------------------------

const harness = ({ env, portal, register = () => true, helperAvailable = true, noGlobalShortcut = false }) => {
  const logs = [];
  const registered = [];
  const trigger = createAgentVoiceTrigger();
  const started = [];
  const globalShortcut = noGlobalShortcut ? undefined : {
    register: (accelerator, callback) => {
      const ok = register(accelerator);
      if (ok) registered.push({ accelerator, callback });
      return ok;
    },
    unregister: (accelerator) => registered.splice(0, registered.length, ...registered.filter((r) => r.accelerator !== accelerator)),
  };
  const hotkey = createAgentVoiceHotkey({
    env, trigger, globalShortcut, helper: '/h', helperAvailable: () => helperAvailable,
    startPortal: async (options) => {
      started.push(options);
      return portal(options);
    },
    log: (line) => logs.push(line),
  });
  return { hotkey, trigger, logs, registered, started };
};
const okPortal = (stops = []) => async (options) => ({ ok: true, trigger: `${options.trigger}!`, stop: () => stops.push(options.id) });

test('Wayland: portal gives hold-to-talk, press and release reach the page state', async () => {
  const stops = [];
  const h = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: okPortal(stops) });
  const info = await h.hotkey.bind(key('F13'));
  assert.deepEqual(info, { path: 'portal', trigger: 'F13!' });
  assert.equal(h.started[0].id, 'agent-voice-f13');
  h.started[0].onKey(true);
  assert.equal(h.trigger.state().key, true);
  h.started[0].onKey(false);
  assert.equal(h.trigger.state().key, false);
  assert.match(h.logs.join('\n'), /global hotkey, portal F13! \[wayland\]/);
  // rebinding stops the old session, then binds the new one
  assert.equal((await h.hotkey.bind(key('Space', 'ca'))).trigger, 'CTRL+ALT+space!');
  assert.deepEqual(stops, ['agent-voice-f13']);
  // unbinding
  assert.deepEqual(await h.hotkey.bind(undefined), { path: 'window', reason: 'none' });
  assert.deepEqual(stops, ['agent-voice-f13', 'agent-voice-ctrl-alt-space']);
});

test('Wayland without a usable portal falls back to the window hotkey and CLI, and logs why', async () => {
  const denied = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: async () => ({ ok: false, reason: 'denied' }) });
  assert.deepEqual(await denied.hotkey.bind(key('F13')), { path: 'window', reason: 'denied' });
  assert.equal(denied.registered.length, 0); // never Electron's globalShortcut on Wayland
  assert.match(denied.logs.join('\n'), /portal hotkey not available: denied/);
  assert.match(denied.logs.join('\n'), /fallback: in-window hotkey and CLI \(denied\)/);
  const noHelper = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: okPortal(), helperAvailable: false });
  assert.deepEqual(await noHelper.hotkey.bind(key('F13')), { path: 'window', reason: 'no-helper' });
  assert.equal(noHelper.started.length, 0);
  const lone = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: okPortal() });
  assert.deepEqual(await lone.hotkey.bind(key('AltRight')), { path: 'window', reason: 'modifier-only' });
  assert.equal(lone.started.length, 0);
});

test('X11: portal first, then Electron globalShortcut with toggle semantics', async () => {
  const noPortal = harness({ env: { XDG_SESSION_TYPE: 'x11' }, portal: async () => ({ ok: false, reason: 'no-portal' }) });
  const info = await noPortal.hotkey.bind(key('F13', 'c'));
  assert.deepEqual(info, { path: 'x11', trigger: 'Control+F13' });
  assert.equal(noPortal.trigger.state().key, null);
  noPortal.registered[0].callback();
  assert.equal(noPortal.trigger.state().trigger, true);
  noPortal.registered[0].callback();
  assert.equal(noPortal.trigger.state().trigger, false);
  await noPortal.hotkey.bind(undefined);
  assert.equal(noPortal.registered.length, 0);

  const withPortal = harness({ env: { XDG_SESSION_TYPE: 'x11' }, portal: okPortal() });
  assert.equal((await withPortal.hotkey.bind(key('F13'))).path, 'portal');
  assert.equal(withPortal.registered.length, 0);
});

test('X11: key already grabbed by another app falls back', async () => {
  const h = harness({ env: { DISPLAY: ':0' }, portal: async () => ({ ok: false, reason: 'no-portal' }), register: () => false });
  assert.deepEqual(await h.hotkey.bind(key('F13')), { path: 'window', reason: 'register-failed' });
  const none = harness({ env: { DISPLAY: ':0' }, portal: async () => ({ ok: false, reason: 'no-portal' }), noGlobalShortcut: true });
  assert.deepEqual(await none.hotkey.bind(key('F13')), { path: 'window', reason: 'no-portal' });
});

test('the newest bind wins when binds overlap; a late portal answer is stopped', async () => {
  const stops = [];
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const h = harness({
    env: { XDG_SESSION_TYPE: 'wayland' },
    portal: async (options) => {
      calls += 1;
      if (calls === 1) await slow;
      return { ok: true, trigger: options.trigger, stop: () => stops.push(options.trigger) };
    },
  });
  const first = h.hotkey.bind(key('F13'));
  await tick(); // the first bind is waiting for the portal
  assert.equal(calls, 1);
  const second = h.hotkey.bind(key('F14'));
  release();
  await first;
  const info = await second;
  assert.deepEqual(info, { path: 'portal', trigger: 'F14' });
  assert.deepEqual(stops, ['F13']);
});

test('the desktop ending the session falls back and releases the key', async () => {
  const h = harness({ env: { XDG_SESSION_TYPE: 'wayland' }, portal: okPortal() });
  await h.hotkey.bind(key('F13'));
  h.started[0].onKey(true);
  h.started[0].onEnd('closed');
  assert.deepEqual(h.hotkey.info(), { path: 'window', reason: 'closed' });
  assert.equal(h.trigger.state().key, false);
});

// ---- the real helper against a fake portal on a private bus -----------------------------------

const have = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'ignore' });
  return !result.error && result.status === 0;
};
const canRunNative = have('cc', ['--version']) && have('pkg-config', ['--exists', 'gio-2.0']) && have('dbus-daemon', ['--version']);

test('native helper talks to a fake portal: bind, press, release, close, no portal', { skip: !canRunNative && 'needs cc, GIO and dbus-daemon' }, async (t) => {
  const dir = fs.mkdtempSync(path.join('/tmp', 'dd-'));
  const children = [];
  t.after(() => {
    children.forEach((child) => child.kill('SIGKILL'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const flags = spawnSync('pkg-config', ['--cflags', '--libs', 'gio-2.0']).stdout.toString().trim().split(/\s+/);
  for (const [source, output] of [['../native/global-shortcut.c', 'helper'], ['fixtures/fake-portal.c', 'portal']]) {
    const built = spawnSync('cc', ['-std=c11', '-O1', '-Wall', '-Wextra', '-Werror', path.join(__dirname, source), '-o', path.join(dir, output), ...flags]);
    assert.equal(built.status, 0, built.stderr.toString());
  }
  fs.writeFileSync(path.join(dir, 'bus.conf'), `<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig><type>session</type><listen>unix:path=${dir}/b</listen><auth>EXTERNAL</auth>
<policy context="default"><allow send_destination="*" eavesdrop="true"/><allow eavesdrop="true"/><allow own="*"/></policy></busconfig>`);
  const daemon = spawn('dbus-daemon', ['--nofork', '--config-file', path.join(dir, 'bus.conf'), '--print-address'], { stdio: ['ignore', 'pipe', 'ignore'] });
  children.push(daemon);
  const address = await new Promise((resolve) => daemon.stdout.once('data', (data) => resolve(data.toString().trim().split('\n')[0])));
  const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: address };
  const run = (name, args = [], extra = {}) => {
    const child = spawn(path.join(dir, name), args, { env: { ...env, ...extra }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(child);
    child.lines = [];
    let buffered = '';
    child.stdout.on('data', (data) => {
      buffered += data;
      const parts = buffered.split('\n');
      buffered = parts.pop();
      child.lines.push(...parts);
      child.emit('lines');
    });
    child.waitFor = (line, ms = 5000) => new Promise((resolve, reject) => {
      const check = () => child.lines.includes(line) || child.lines.some((l) => l.startsWith(`${line} `));
      if (check()) return resolve();
      const timer = setTimeout(() => reject(new Error(`no "${line}" in ${JSON.stringify(child.lines)}`)), ms);
      child.on('lines', () => { if (check()) { clearTimeout(timer); resolve(); } });
    });
    return child;
  };

  // 1. no portal on the bus: the helper says so and ends
  const lonely = run('helper', ['agent-voice-f13', 'F13', 'Talk']);
  await lonely.waitFor('error no-portal');
  assert.equal(await new Promise((resolve) => lonely.on('exit', resolve)), 1);

  // 2. denied by the user
  const denying = run('portal', [], { FAKE_PORTAL_DENY: '1' });
  await denying.waitFor('ready');
  const denied = run('helper', ['agent-voice-f13', 'F13', 'Talk']);
  await denied.waitFor('error denied');
  denying.kill('SIGKILL');
  await new Promise((resolve) => denying.on('exit', resolve));

  // 3. full flow through the JS wrapper: bound, press / release, then the session is closed on stop
  const portal = run('portal');
  await portal.waitFor('ready');
  const events = [];
  const result = await startPortalShortcut({
    command: path.join(dir, 'helper'), id: 'agent-voice-ctrl-f13', trigger: 'CTRL+F13', description: 'Talk',
    onKey: (down) => events.push(down),
    spawnProcess: (command, args, options) => spawn(command, args, { ...options, env }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.trigger, 'CTRL+F13 (fake desktop)');
  portal.stdin.write('down\n');
  portal.stdin.write('up\n');
  portal.stdin.write('down\n');
  for (let i = 0; i < 100 && events.length < 3; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, [true, false, true]);
  result.stop();
  await portal.waitFor('session-closed-by-client');
});
