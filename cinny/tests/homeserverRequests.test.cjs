const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative, imports = {}) {
  const filename = path.join(__dirname, '../src/app/', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2016,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      AbortController,
      DOMException,
      setTimeout,
      clearTimeout,
      require: (id) => {
        if (!(id in imports)) throw new Error(id);
        return imports[id];
      },
    },
    { filename }
  );
  return exports;
}
const { withHomeserverTimeout } = load('utils/requestTimeout.ts');
const api = load('cs-api.ts', {
  'await-to-js': {
    __esModule: true,
    default: async (promise) => {
      try {
        return [null, await promise];
      } catch (error) {
        return [error];
      }
    },
  },
  './utils/common': { trimTrailingSlash: (value) => value.replace(/\/+$/, '') },
  './utils/requestTimeout': {
    withHomeserverTimeout: (operation, signal) => withHomeserverTimeout(operation, signal, 15),
  },
});
const never = () => new Promise(() => {});
const response = (body, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

test('a successful operation completes normally', async () => {
  assert.equal(await withHomeserverTimeout(async () => 42, undefined, 100), 42);
});
test('a transport which ignores AbortSignal still cannot strand the loading screen', async () => {
  let activeSignal;
  await assert.rejects(
    withHomeserverTimeout(
      (signal) => {
        activeSignal = signal;
        return never();
      },
      undefined,
      10
    ),
    { name: 'TimeoutError' }
  );
  assert.equal(activeSignal.aborted, true);
});
test('retry/unmount cancellation aborts the original transport', async () => {
  const outer = new AbortController();
  let activeSignal;
  const request = withHomeserverTimeout(
    (signal) => {
      activeSignal = signal;
      return never();
    },
    outer.signal,
    100
  );
  await Promise.resolve();
  const rejected = assert.rejects(request, { name: 'AbortError' });
  outer.abort();
  await rejected;
  assert.equal(activeSignal.aborted, true);
});
test('already canceled requests never begin a network operation', async () => {
  const outer = new AbortController();
  outer.abort();
  let called = false;
  await assert.rejects(
    withHomeserverTimeout(
      async () => {
        called = true;
      },
      outer.signal,
      100
    ),
    { name: 'AbortError' }
  );
  assert.equal(called, false);
});
test('synchronous request failures propagate without hanging', async () => {
  await assert.rejects(
    withHomeserverTimeout(
      () => {
        throw new Error('fixture failure');
      },
      undefined,
      100
    ),
    /fixture failure/
  );
});
test('versions use the actual Matrix endpoint and validate successful JSON', async () => {
  let called;
  const result = await api.specVersions(async (url, options) => {
    called = { url, options };
    return response({ versions: ['v1.11'] });
  }, 'http://127.0.0.1:8008/');
  assert.equal(called.url, 'http://127.0.0.1:8008/_matrix/client/versions');
  assert.equal(typeof called.options.signal.aborted, 'boolean');
  assert.equal(result.versions[0], 'v1.11');
});
test('HTTP errors and invalid version payloads cannot be mistaken for a connected homeserver', async () => {
  await assert.rejects(
    api.specVersions(async () => response({ versions: ['v1.11'] }, 503), 'https://example.org'),
    /HTTP 503/
  );
  await assert.rejects(
    api.specVersions(async () => response({ versions: [123] }), 'https://example.org'),
    /valid Matrix/
  );
});
test('a stalled response body is bounded, not just the initial HTTP request', async () => {
  await assert.rejects(
    api.specVersions(async () => ({ ok: true, status: 200, json: never }), 'https://example.org'),
    { name: 'TimeoutError' }
  );
});
test('missing discovery falls back to the explicitly chosen homeserver', async () => {
  const result = await api.autoDiscovery(async () => response({}, 404), 'http://127.0.0.1:8008');
  assert.equal(result[1]['m.homeserver'].base_url, 'http://127.0.0.1:8008');
});
test('stalled discovery is canceled instead of showing Looking for homeserver indefinitely', async () => {
  await assert.rejects(api.autoDiscovery(never, 'https://example.org'), { name: 'TimeoutError' });
});
