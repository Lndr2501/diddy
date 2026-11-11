// #161: the theme message to the call page waits until the page answers widget messages.
// Sent earlier it was lost, and 10 s later every call start logged
// "js unhandled rejection: Request timed out" (or "Transport stopped" when the call ended first).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/app/plugins/call/callThemeSync.ts');
const mod = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText,
  { exports: mod }
);
const { createThemeSync } = mod;

const flush = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const setup = (initial = 'dark', fail = false) => {
  const sent = [];
  const logs = [];
  const send = (theme) => {
    sent.push(theme);
    return fail ? Promise.reject(new Error('Request timed out')) : Promise.resolve({});
  };
  return { sent, logs, sync: createThemeSync(initial, send, (l) => logs.push(l)) };
};

test('nothing is sent before the call page is ready (it would be lost and time out)', () => {
  const { sent, sync } = setup('dark');
  sync.set('dark');
  sync.set('light');
  assert.deepEqual(sent, []);
});

test('the theme the page started with is never sent, also not once it is ready', () => {
  const { sent, sync } = setup('dark');
  sync.set('dark');
  sync.ready();
  sync.set('dark');
  assert.deepEqual(sent, []);
});

test('a change made while the page was loading is sent once it is ready, only the last one', () => {
  const { sent, sync } = setup('dark');
  sync.set('light');
  sync.set('dark');
  sync.set('light');
  assert.deepEqual(sent, []);
  sync.ready();
  assert.deepEqual(sent, ['light']);
});

test('changes after ready are sent right away, a repeat is not sent again', () => {
  const { sent, sync } = setup('light');
  sync.ready();
  sync.set('dark');
  sync.set('dark');
  sync.set('light');
  assert.deepEqual(sent, ['dark', 'light']);
});

test('a failed delivery is logged instead of rejecting, and the next change tries again', async () => {
  const { sent, logs, sync } = setup('dark', true);
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  process.on('unhandledRejection', onUnhandled);
  try {
    sync.ready();
    sync.set('light');
    await flush();
    assert.equal(logs.length, 1);
    assert.match(logs[0], /call theme change to light not delivered .*Request timed out/);
    // the page may still have the old theme: the same theme is offered again
    sync.set('light');
    await flush();
    assert.deepEqual(sent, ['light', 'light']);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('after the call is gone nothing is sent, and a late failure is not logged', async () => {
  const sent = [];
  const logs = [];
  let rejectLate;
  const sync = createThemeSync(
    'dark',
    (theme) => {
      sent.push(theme);
      return new Promise((resolve, reject) => {
        rejectLate = reject;
      });
    },
    (l) => logs.push(l)
  );
  sync.ready();
  sync.set('light');
  sync.stop();
  rejectLate(new Error('Transport stopped'));
  sync.set('dark');
  sync.ready();
  await flush();
  assert.deepEqual(sent, ['light']);
  assert.deepEqual(logs, []);
});

test('CallEmbed sends the theme only through the sync, released by the widget "ready" event', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/app/plugins/call/CallEmbed.ts'),
    'utf8'
  );
  const setTheme = src.match(/public setTheme\([^)]*\)[^{]*\{([^}]*)\}/);
  assert.ok(setTheme, 'setTheme found');
  assert.match(setTheme[1], /this\.themeSync\.set\(theme\)/);
  assert.doesNotMatch(setTheme[1], /transport\.send/);
  assert.match(src, /listenEvent\('ready', \(\) => this\.themeSync\.ready\(\)\)/);
  assert.match(src, /this\.themeSync\.stop\(\)/);
});
