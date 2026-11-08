const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/localPlugins.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

function load() {
  const exports = {};
  // only the globals the module documents; no window, storage, require or fetch
  vm.runInNewContext(
    compiled,
    {
      exports,
      URL,
      TextEncoder,
      TextDecoder,
      AbortController,
      crypto: globalThis.crypto,
      setTimeout,
      clearTimeout,
      Uint8Array,
    },
    { filename }
  );
  return exports;
}
const L = load();
const plain = (value) => JSON.parse(JSON.stringify(value));
const PAGE = '<!doctype html><html><head><title>My Clock</title></head><body>hi</body></html>';

test('GitHub blob, raw and Gist links become raw addresses', () => {
  const cases = [
    [
      'https://github.com/Lndr2501/diddy/blob/main/docs/plugins/github-issues.html',
      'https://raw.githubusercontent.com/Lndr2501/diddy/main/docs/plugins/github-issues.html',
      'github',
    ],
    [
      'github.com/u/r/raw/feature/x/p.htm?plain=1#L3',
      'https://raw.githubusercontent.com/u/r/feature/x/p.htm',
      'github',
    ],
    [
      'https://raw.githubusercontent.com/u/r/main/a/b.html',
      'https://raw.githubusercontent.com/u/r/main/a/b.html',
      'github',
    ],
    [
      'https://gist.github.com/user/0123abcdef',
      'https://gist.githubusercontent.com/user/0123abcdef/raw',
      'gist',
    ],
    [
      'https://gist.github.com/user/0123abcdef/raw/feed01/plugin.html',
      'https://gist.githubusercontent.com/user/0123abcdef/raw/feed01/plugin.html',
      'gist',
    ],
    [
      'https://gist.githubusercontent.com/user/0123abcdef/raw/feed01/plugin.html',
      'https://gist.githubusercontent.com/user/0123abcdef/raw/feed01/plugin.html',
      'gist',
    ],
    [
      'HTTPS://GitHub.com/u/r/blob/main/p.html',
      'https://raw.githubusercontent.com/u/r/main/p.html',
      'github',
    ],
  ];
  for (const [input, rawUrl, kind] of cases) {
    const result = L.toRawSourceUrl(input);
    assert.equal(result.ok, true, `${input}: ${result.error}`);
    assert.equal(result.value.rawUrl, rawUrl, input);
    assert.equal(result.value.kind, kind, input);
  }
  assert.equal(
    L.toRawSourceUrl('https://github.com/u/r/blob/main/p.html').value.label,
    'u/r/main/p.html'
  );
});

test('only https, only the allowed hosts, no credentials or ports', () => {
  for (const input of [
    'http://github.com/u/r/blob/main/p.html',
    'http://raw.githubusercontent.com/u/r/main/p.html',
    'ftp://github.com/u/r/blob/main/p.html',
    'javascript:alert(1)//github.com/u/r/blob/main/p.html',
    'data:text/html,<b>x</b>',
    'file:///etc/passwd.html',
    'https://evil.example/u/r/blob/main/p.html',
    'https://github.com.evil.example/u/r/blob/main/p.html',
    'https://evilgithub.com/u/r/blob/main/p.html',
    'https://sub.github.com/u/r/blob/main/p.html',
    'https://raw.githubusercontent.com.evil.example/u/r/main/p.html',
    'https://githubusercontent.com/u/r/main/p.html',
    'https://user:pw@github.com/u/r/blob/main/p.html',
    'https://github.com@evil.example/u/r/blob/main/p.html',
    'https://evil.example@github.com/u/r/blob/main/p.html',
    'https://github.com:8443/u/r/blob/main/p.html',
    'https://raw.githubusercontent.com:443x/u/r/main/p.html',
    'https://127.0.0.1/u/r/blob/main/p.html',
    'https://github.com\\@evil.example/u/r/blob/main/p.html',
    '',
    `https://github.com/u/r/blob/main/${'a'.repeat(2100)}.html`,
  ]) {
    assert.equal(L.toRawSourceUrl(input).ok, false, input);
  }
});

test('path tricks and non-file links are refused', () => {
  for (const input of [
    'https://github.com/u/r/blob/main/../../evil/x/main/p.html',
    'https://github.com/u/r/blob/main/./p.html',
    'https://github.com/u/r/blob/main/%2e%2e/p.html',
    'https://github.com/u/r/blob/main/a%2Fb.html',
    'https://github.com/u/r/blob/main/a%5cb.html',
    'https://github.com/u/r/blob/main/a%00.html',
    'https://raw.githubusercontent.com/u/r/main/a\\..\\b.html',
    'https://github.com/u/r/blob/main/p.js',
    'https://github.com/u/r/blob/main/p.html.exe',
    'https://github.com/u/r',
    'https://github.com/u/r/tree/main/p.html',
    'https://github.com/u/r/blob/main',
    'https://github.com/-bad/r/blob/main/p.html',
    'https://github.com/u/r/blob/ma in/p.html',
    'https://github.com/u/r/blob/main//p.html',
    'https://raw.githubusercontent.com/u/r/p.html',
    'https://gist.github.com/user',
    'https://gist.github.com/user/not-hex!',
    'https://gist.github.com/user/abc/edit',
    'https://gist.githubusercontent.com/user/abc/notraw/p.html',
    'https://gist.githubusercontent.com/user/abc/raw/a/b/c',
  ]) {
    assert.equal(L.toRawSourceUrl(input).ok, false, input);
  }
});

test('content checks: html only, size cap, no binary', () => {
  assert.equal(L.validateLocalHtml(PAGE).ok, true);
  assert.equal(L.validateLocalHtml('\uFEFF<div>x</div>').value, '<div>x</div>');
  assert.equal(L.validateLocalHtml('  <!-- c --><main>x</main>').ok, true);
  for (const bad of ['', '   ', 'hello world', '{"a":1}', 'x <div>', '<div>\u0000</div>', 42]) {
    assert.equal(L.validateLocalHtml(bad).ok, false, String(bad));
  }
  const filler = (n) => `<div>${'a'.repeat(n - 11)}</div>`;
  assert.equal(L.validateLocalHtml(filler(L.MAX_LOCAL_PLUGIN_BYTES)).ok, true);
  assert.equal(L.validateLocalHtml(filler(L.MAX_LOCAL_PLUGIN_BYTES + 1)).ok, false);
  // the cap counts UTF-8 bytes, not characters
  const multi = `<div>${'ä'.repeat(L.MAX_LOCAL_PLUGIN_BYTES / 2)}</div>`;
  assert.equal(L.validateLocalHtml(multi).ok, false);
  assert.equal(L.MAX_LOCAL_PLUGIN_BYTES, 512 * 1024);
});

test('file checks by name or type and size before reading', () => {
  assert.equal(L.checkPluginFile({ name: 'a.html', type: '', size: 10 }).ok, true);
  assert.equal(L.checkPluginFile({ name: 'A.HTM', type: '', size: 10 }).ok, true);
  assert.equal(L.checkPluginFile({ name: 'page', type: 'text/html', size: 10 }).ok, true);
  assert.equal(L.checkPluginFile({ name: 'a.js', type: 'text/javascript', size: 10 }).ok, false);
  assert.equal(L.checkPluginFile({ name: 'a.html.png', type: 'image/png', size: 10 }).ok, false);
  assert.equal(
    L.checkPluginFile({ name: 'a.html', type: '', size: L.MAX_LOCAL_PLUGIN_BYTES + 1 }).ok,
    false
  );
});

test('names default to the title, then the file name', () => {
  assert.equal(L.extractHtmlTitle(PAGE), 'My Clock');
  assert.equal(L.extractHtmlTitle('<title> A &amp; B\u202e </title>'), 'A & B');
  assert.equal(L.extractHtmlTitle(`<title>${'x'.repeat(100)}</title>`).length, 40);
  assert.equal(L.extractHtmlTitle('<div>no title</div>'), '');
  assert.equal(L.nameFromFileName('C:\\x\\my-weather.html'), 'my-weather');
  assert.equal(L.defaultPluginName('  Own ', PAGE, 'file'), 'Own');
  assert.equal(L.defaultPluginName('', PAGE, 'file'), 'My Clock');
  assert.equal(L.defaultPluginName('', '<div>x</div>', 'file'), 'file');
});

test('sha-256 of the UTF-8 content and a short hash', async () => {
  assert.equal(
    await L.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(
    await L.sha256Hex('ä'),
    require('node:crypto').createHash('sha256').update('ä', 'utf8').digest('hex')
  );
  assert.equal(L.shortHash('ba7816bf8f01cfea4141'), 'ba7816bf8f01');
  assert.equal(L.formatSize(10), '10 B');
  assert.equal(L.formatSize(4096), '4 KB');
});

const RAW = 'https://raw.githubusercontent.com/u/r/main/p.html';
const respond =
  (body, init = {}) =>
  () =>
    Promise.resolve(new Response(body, init));

test('fetch: one checked request without cookies, redirects or referrer', async () => {
  let seen;
  const result = await L.fetchSourceHtml(RAW, (url, init) => {
    seen = { url, init };
    return Promise.resolve(new Response(PAGE, { status: 200 }));
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, PAGE);
  assert.equal(seen.url, RAW);
  assert.equal(seen.init.credentials, 'omit');
  assert.equal(seen.init.redirect, 'error');
  assert.equal(seen.init.referrerPolicy, 'no-referrer');

  let called = false;
  const fetchSpy = () => {
    called = true;
    return Promise.resolve(new Response(PAGE));
  };
  for (const url of [
    'https://evil.example/p.html',
    'https://github.com/u/r/blob/main/p.html', // not the raw form
    'http://raw.githubusercontent.com/u/r/main/p.html',
  ]) {
    assert.equal((await L.fetchSourceHtml(url, fetchSpy)).ok, false, url);
  }
  assert.equal(called, false);
});

test('fetch: errors, size cap, non-html and timeout', async () => {
  assert.match((await L.fetchSourceHtml(RAW, respond('x', { status: 404 }))).error, /not found/);
  assert.equal((await L.fetchSourceHtml(RAW, respond('x', { status: 500 }))).ok, false);
  assert.equal((await L.fetchSourceHtml(RAW, respond('just text'))).ok, false);
  const big = `<div>${'a'.repeat(2000)}</div>`;
  assert.match((await L.fetchSourceHtml(RAW, respond(big), { maxBytes: 1000 })).error, /large/);
  assert.equal((await L.fetchSourceHtml(RAW, respond(big), { maxBytes: 5000 })).ok, true);
  assert.equal(
    (
      await L.fetchSourceHtml(
        RAW,
        respond(PAGE, { headers: { 'content-length': String(L.MAX_LOCAL_PLUGIN_BYTES + 1) } })
      )
    ).ok,
    false
  );
  const hang = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  const slow = await L.fetchSourceHtml(RAW, hang, { timeoutMs: 20 });
  assert.match(slow.error, /too long/);
  const broken = await L.fetchSourceHtml(RAW, () => Promise.reject(new TypeError('net')));
  assert.equal(broken.ok, false);
  assert.deepEqual(plain(Object.keys(broken)), ['ok', 'error']);
});
