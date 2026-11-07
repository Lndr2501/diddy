const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/userPlugins.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

function load() {
  const exports = {};
  // no window, no storage, no require: the module must stay pure
  vm.runInNewContext(compiled, { exports, URL }, { filename });
  return exports;
}
const P = load();
const APP = 'http://localhost:44548';
const opts = (id, extra = {}) => ({ id, now: 1000, appOrigin: APP, ...extra });
// values created inside the vm realm compare structurally with deepEqual
const plain = (value) => JSON.parse(JSON.stringify(value));

test('https URLs are accepted and normalized, a missing scheme means https', () => {
  assert.deepEqual(plain(P.normalizePluginUrl(' https://Example.com/w.html ')), {
    ok: true,
    value: 'https://example.com/w.html',
  });
  assert.equal(P.normalizePluginUrl('example.com/plugin').value, 'https://example.com/plugin');
});

test('http only for loopback hosts, other schemes are refused', () => {
  for (const url of ['http://localhost:5173/', 'http://127.0.0.1:8000/p', 'http://[::1]:3000/']) {
    assert.equal(P.normalizePluginUrl(url).ok, true, url);
  }
  for (const url of [
    'http://example.com/',
    'http://127.0.0.1.nip.io/',
    'ftp://example.com/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'tauri://localhost/',
    'blob:https://example.com/x',
  ]) {
    assert.equal(P.normalizePluginUrl(url).ok, false, url);
  }
});

test('credentials, internal *.localhost names, spaces and the app origin are refused', () => {
  assert.equal(P.normalizePluginUrl('https://user:pw@example.com/').ok, false);
  assert.equal(P.normalizePluginUrl('https://tauri.localhost/').ok, false);
  assert.equal(P.normalizePluginUrl('http://ipc.localhost/').ok, false);
  assert.equal(P.normalizePluginUrl('https://exa mple.com/').ok, false);
  assert.equal(P.normalizePluginUrl('').ok, false);
  assert.equal(P.normalizePluginUrl(`https://example.com/${'a'.repeat(2100)}`).ok, false);
  // the desktop app's own origin is always reserved, the current origin when passed
  assert.equal(P.normalizePluginUrl('http://localhost:44548/index.html').ok, false);
  assert.equal(
    P.normalizePluginUrl('https://app.example.org/x', 'https://app.example.org').ok,
    false
  );
  assert.equal(
    P.normalizePluginUrl('https://other.example.org/x', 'https://app.example.org').ok,
    true
  );
});

test('names are cleaned of control characters and limited in length', () => {
  assert.equal(P.normalizePluginName('  My\u0000  Weather\u202e ').value, 'My Weather');
  assert.equal(P.normalizePluginName('   ').ok, false);
  assert.equal(P.normalizePluginName('x'.repeat(41)).ok, false);
  assert.equal(P.normalizePluginName('x'.repeat(40)).ok, true);
});

test('adding validates input, rejects duplicates and enforces the limit of 12', () => {
  let list = [];
  const first = P.addPlugin(list, { name: 'Weather', url: 'https://w.example/' }, opts('a'));
  assert.equal(first.ok, true);
  list = first.value;
  assert.deepEqual(plain(list), [
    { id: 'a', name: 'Weather', url: 'https://w.example/', enabled: true, addedAt: 1000 },
  ]);

  assert.equal(P.addPlugin(list, { name: 'Other', url: 'https://W.example' }, opts('b')).ok, false);
  assert.equal(
    P.addPlugin(list, { name: 'weather', url: 'https://x.example/' }, opts('b')).ok,
    false
  );
  assert.equal(
    P.addPlugin(list, { name: 'Other', url: 'https://x.example/' }, opts('a')).ok,
    false
  );
  assert.equal(
    P.addPlugin(list, { name: 'Bad', url: 'http://evil.example/' }, opts('b')).ok,
    false
  );

  for (let i = 1; i < P.MAX_PLUGINS; i += 1) {
    const next = P.addPlugin(
      list,
      { name: `P${i}`, url: `https://p${i}.example/` },
      opts(`id${i}`)
    );
    assert.equal(next.ok, true);
    list = next.value;
  }
  assert.equal(list.length, 12);
  const over = P.addPlugin(list, { name: 'Too many', url: 'https://more.example/' }, opts('z'));
  assert.equal(over.ok, false);
  assert.match(over.error, /12/);
});

test('enable, disable and remove return new lists and leave the input untouched', () => {
  const list = P.addPlugin([], { name: 'A', url: 'https://a.example/' }, opts('a')).value;
  const off = P.setPluginEnabled(list, 'a', false);
  assert.equal(list[0].enabled, true);
  assert.equal(off[0].enabled, false);
  assert.equal(P.getActivePlugins(off).length, 0);
  assert.equal(P.getActivePlugins(P.setPluginEnabled(off, 'a', true)).length, 1);
  assert.equal(P.setPluginEnabled(list, 'missing', false)[0], list[0]);
  assert.equal(P.removePlugin(list, 'a').length, 0);
  assert.equal(list.length, 1);
});

test('stored data round-trips and malformed entries are dropped one by one', () => {
  const list = P.addPlugin([], { name: 'A', url: 'https://a.example/' }, opts('a')).value;
  assert.deepEqual(
    plain(P.parseStoredPlugins(JSON.parse(P.serializePlugins(list)), APP)),
    plain(list)
  );

  for (const raw of [null, 'x', 42, [], {}, { version: 2, plugins: [] }, { version: 1 }]) {
    assert.deepEqual(plain(P.parseStoredPlugins(raw, APP)), []);
  }
  const parsed = P.parseStoredPlugins(
    {
      version: 1,
      plugins: [
        { id: 'ok', name: 'Fine', url: 'https://fine.example/', enabled: false, addedAt: 5 },
        { id: 'dupe', name: 'Fine 2', url: 'https://fine.example/' },
        { id: 'evil', name: 'Evil', url: 'javascript:alert(1)' },
        { id: 'self', name: 'Self', url: 'http://localhost:44548/' },
        { id: 7, name: 'Bad id', url: 'https://b.example/' },
        'nope',
        { id: 'noflag', name: 'No flag', url: 'https://n.example/', addedAt: 'x' },
      ],
    },
    APP
  );
  assert.deepEqual(plain(parsed), [
    { id: 'ok', name: 'Fine', url: 'https://fine.example/', enabled: false, addedAt: 5 },
    { id: 'noflag', name: 'No flag', url: 'https://n.example/', enabled: true, addedAt: 0 },
  ]);

  const many = Array.from({ length: 20 }, (_, i) => ({
    id: `i${i}`,
    name: `N${i}`,
    url: `https://n${i}.example/`,
  }));
  assert.equal(P.parseStoredPlugins({ version: 1, plugins: many }, APP).length, 12);
});

test('ready messages: optional apiVersion and a loosely checked manifest', () => {
  assert.deepEqual(plain(P.parsePluginMessage({ type: 'diddy:ready' })), { type: 'diddy:ready' });
  assert.deepEqual(
    plain(
      P.parsePluginMessage({
        type: 'diddy:ready',
        apiVersion: 1,
        manifest: { name: ' Wetter ', description: 'Forecast\u0007', height: 9999, extra: 1 },
      })
    ),
    {
      type: 'diddy:ready',
      apiVersion: 1,
      manifest: { name: 'Wetter', description: 'Forecast', height: 600 },
    }
  );
  assert.deepEqual(
    plain(P.parsePluginMessage({ type: 'diddy:ready', manifest: { name: 5, height: 'big' } })),
    { type: 'diddy:ready', manifest: {} }
  );
  const long = P.parsePluginMessage({
    type: 'diddy:ready',
    manifest: { description: 'd'.repeat(500) },
  });
  assert.equal(long.manifest.description.length, P.MAX_MANIFEST_DESCRIPTION_LENGTH);
  assert.equal(P.parsePluginMessage({ type: 'diddy:ready', apiVersion: '1' }), undefined);
  assert.equal(P.parsePluginMessage({ type: 'diddy:ready', apiVersion: 0 }), undefined);
  assert.equal(P.parsePluginMessage({ type: 'diddy:ready', token: 'x' }), undefined);
});

test('resize messages are validated and clamped to 80-600 px', () => {
  assert.deepEqual(plain(P.parsePluginMessage({ type: 'diddy:resize', height: 321.6 })), {
    type: 'diddy:resize',
    height: 322,
  });
  assert.equal(P.parsePluginMessage({ type: 'diddy:resize', height: 10 }).height, 80);
  assert.equal(P.parsePluginMessage({ type: 'diddy:resize', height: 1e9 }).height, 600);
  for (const height of [NaN, Infinity, '300', null, undefined]) {
    assert.equal(P.parsePluginMessage({ type: 'diddy:resize', height }), undefined, String(height));
  }
  assert.equal(P.parsePluginMessage({ type: 'diddy:resize', height: 200, width: 5 }), undefined);
});

test('anything that is not a known message shape is ignored', () => {
  for (const data of [
    null,
    undefined,
    'diddy:ready',
    42,
    ['diddy:ready'],
    { type: 'diddy:init', apiVersion: 1, theme: 'dark', locale: 'en' },
    { type: 'diddy:sendMessage', body: 'hi' },
    { type: 1 },
    {},
    new Date(),
  ]) {
    assert.equal(P.parsePluginMessage(data), undefined);
  }
});

test('init message carries only API version, theme, layout and a sane locale', () => {
  assert.deepEqual(plain(P.createInitMessage('light', 'de-DE')), {
    type: 'diddy:init',
    apiVersion: 1,
    theme: 'light',
    locale: 'de-DE',
    layout: 'full',
  });
  assert.equal(P.createInitMessage('dark', 'en', 'compact').layout, 'compact');
  assert.equal(P.createInitMessage('dark', 'en', 'weird').layout, 'full');
  assert.equal(P.createInitMessage('dark', undefined).locale, 'en');
  assert.equal(P.createInitMessage('weird', '<script>').theme, 'dark');
  assert.equal(P.createInitMessage('dark', '<script>').locale, 'en');
  assert.deepEqual(Object.keys(P.createInitMessage('dark', 'en')).sort(), [
    'apiVersion',
    'layout',
    'locale',
    'theme',
    'type',
  ]);
});

test('frame heights clamp, non-finite input falls back to the default', () => {
  assert.equal(P.clampFrameHeight(0), 80);
  assert.equal(P.clampFrameHeight(240), 240);
  assert.equal(P.clampFrameHeight(601), 600);
  assert.equal(P.clampFrameHeight(NaN), P.DEFAULT_FRAME_HEIGHT);
});
