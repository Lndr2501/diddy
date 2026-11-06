const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/app/plugins/connections.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
function setup(profile, failWith) {
  const calls = [],
    exports = {};
  const window = { __DIDDY_CONNECTION__: profile };
  Object.defineProperty(window, 'localStorage', {
    get() {
      throw new Error('Existing session storage must not be touched');
    },
  });
  Object.defineProperty(window, 'indexedDB', {
    get() {
      throw new Error('Existing account databases must not be touched');
    },
  });
  vm.runInNewContext(
    compiled,
    {
      exports,
      URL,
      TextEncoder,
      window,
      crypto: { getRandomValues: (bytes) => bytes.fill(0x12) },
      require: (id) => {
        if (id !== './tauri') throw new Error(id);
        return {
          invoke: async (command, args) => {
            calls.push({ command, args });
            if (failWith) throw new Error(failWith);
            return [];
          },
        };
      },
    },
    { filename }
  );
  return { ...exports, calls };
}

test('server names and HTTPS base paths normalize without changing the requested service', () => {
  const env = setup();
  assert.equal(env.normalizeHomeserver(' matrix.example.org/ '), 'https://matrix.example.org');
  assert.equal(
    env.normalizeHomeserver('https://example.org/matrix/'),
    'https://example.org/matrix'
  );
});
test('HTTP is accepted for local IPv4/IPv6/localhost test servers only', () => {
  const env = setup();
  for (const url of ['http://localhost:8008', 'http://127.0.0.1:8008', 'http://[::1]:8008']) {
    assert.equal(env.normalizeHomeserver(url), url);
  }
  assert.throws(() => env.normalizeHomeserver('http://127.example.org'));
  assert.throws(() => env.normalizeHomeserver('http://matrix.example.org'));
});
test('server addresses must not contain credentials, query tokens, fragments or unsafe protocols', () => {
  const env = setup();
  for (const url of [
    '',
    'file:///data',
    'javascript:alert(1)',
    'https://user:fixture@example.org',
    'https://example.org/?token=fixture',
    'https://example.org/#fragment',
  ]) {
    assert.throws(() => env.normalizeHomeserver(url));
  }
});
test('the visible server label strips credentials and query values', () => {
  const env = setup();
  assert.equal(
    env.visibleHomeserver('https://user:fixture@example.org/matrix?token=fixture#fragment'),
    'https://example.org/matrix'
  );
});
test('a new connection requests a fresh native data-store ID without touching existing account data', async () => {
  const env = setup();
  await env.createConnection('http://127.0.0.1:8008/');
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].command, 'open_connection_profile');
  assert.match(env.calls[0].args.id, /^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/);
  assert.equal(env.calls[0].args.server, 'http://127.0.0.1:8008');
  assert.equal(Object.keys(env.calls[0].args).length, 2);
});
test('invalid addresses never reach the native opener', async () => {
  const env = setup();
  await assert.rejects(env.createConnection('https://user:fixture@example.org'));
  assert.equal(env.calls.length, 0);
});
test('reopening a saved connection sends no replacement homeserver or credentials', async () => {
  const env = setup();
  await env.openConnection('main');
  assert.equal(env.calls[0].args.id, 'main');
  assert.deepEqual(Object.keys(env.calls[0].args), ['id']);
});
test('server addresses beyond the native UTF-8 limit are refused before anything is saved', () => {
  const env = setup();
  assert.throws(() => env.normalizeHomeserver('https://matrix.example.org/' + 'x'.repeat(2040)));
  // The typed address fits, but the stored percent-encoded form would not.
  const unicode = `https://matrix.example.org/${'\u00e4'.repeat(800)}`;
  assert.ok(Buffer.byteLength(unicode, 'utf8') <= 2048);
  assert.throws(() => env.normalizeHomeserver(unicode));
});
test('whitespace is trimmed exactly like the native host before the byte limit applies', () => {
  const env = setup();
  // U+0085 counts as whitespace for the host, but not for a plain JavaScript trim
  assert.equal(
    env.normalizeHomeserver('\u0085 https://matrix.example.org/ \u0085'),
    'https://matrix.example.org'
  );
  const padded = `\u00a0     https://matrix.example.org/${'x'.repeat(2015)}     \u0085`;
  assert.ok(Buffer.byteLength(padded, 'utf8') > 2048);
  assert.ok(Buffer.byteLength(env.normalizeHomeserver(padded), 'utf8') <= 2048);
});
test('a native refusal is reported instead of pretending the window opened', async () => {
  const env = setup(undefined, 'Das Verbindungsfenster wird gerade geöffnet.');
  await assert.rejects(env.createConnection('http://127.0.0.1:8008'), /Verbindungsfenster/);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(Object.keys(env.calls[0].args).sort(), ['id', 'server']);
});
test('only correctly shaped native connection metadata is accepted', () => {
  assert.equal(
    setup({ id: '../data', server: 'https://example.org' }).getConnectionProfile(),
    undefined
  );
  const profile = { id: '0123456789ab4def8123456789abcdef', server: 'https://example.org' };
  assert.equal(setup(profile).getConnectionProfile(), profile);
});
