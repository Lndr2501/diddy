// Run from electron/: node --test tests/*.test.cjs
// Covers the parts of the Linux shell that do not need Electron itself.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const paths = require('../lib/paths.cjs');
const diag = require('../lib/diag.cjs');
const connections = require('../lib/connections.cjs');
const myinstants = require('../lib/myinstants.cjs');
const linkPreview = require('../lib/linkPreview.cjs');
const { fitIntoArea, parseWindowState } = require('../lib/windowFit.cjs');
const { cacheControl, resolveFile, contentType, startStaticServer } = require('../lib/staticServer.cjs');
const { parseAgentVoiceLaunch, createAgentVoiceTrigger } = require('../lib/agentVoice.cjs');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-shell-'));
const ID = '0123456789ab4def8123456789abcdef';

test('version matches the Tauri build', () => {
  const tauri = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src-tauri/tauri.conf.json'), 'utf8'));
  const shell = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.equal(shell.version, tauri.version);
});

test('folders follow XDG and keep the Tauri config folder', () => {
  const env = { HOME: '/home/u' };
  assert.equal(paths.configDir(env), '/home/u/.config/app.diddy.desktop');
  assert.equal(paths.browserDataDir(env), '/home/u/.local/share/app.diddy.desktop/electron');
  assert.equal(paths.logDir(env), '/home/u/.local/state/diddy');
  const xdg = { HOME: '/home/u', XDG_CONFIG_HOME: '/cfg', XDG_DATA_HOME: '/data', XDG_STATE_HOME: '/state' };
  assert.equal(paths.configDir(xdg), '/cfg/app.diddy.desktop');
  assert.equal(paths.browserDataDir(xdg), '/data/app.diddy.desktop/electron');
  assert.equal(paths.logDir(xdg), '/state/diddy');
  // relative XDG values are invalid per spec and ignored
  assert.equal(paths.logDir({ HOME: '/home/u', XDG_STATE_HOME: 'relative' }), '/home/u/.local/state/diddy');
});

test('log lines have a timestamp, no newlines and a length limit', () => {
  assert.equal(diag.formatLine('a\nb\rc', 1500), '1.500 abc\n');
  const long = diag.formatLine('x'.repeat(5000), 0);
  assert.equal(long.length, '0.000 '.length + diag.MAX_LINE + 1);
});

test('log file is written and rotated', () => {
  const dir = tempDir();
  const env = { HOME: dir, XDG_STATE_HOME: dir };
  diag.writeLine('hello', env);
  const file = path.join(dir, 'diddy', 'app.log');
  assert.match(fs.readFileSync(file, 'utf8'), /^\d+\.\d{3} hello\n$/);
  fs.writeFileSync(file, Buffer.alloc(2 * 1024 * 1024 + 1));
  diag.writeLine('after rotation', env);
  assert.ok(fs.existsSync(path.join(dir, 'diddy', 'app.log.old')));
  assert.match(fs.readFileSync(file, 'utf8'), /after rotation/);
});

test('profile ids cannot escape storage or alias the default login', () => {
  assert.equal(connections.checkProfileId(ID), ID);
  for (const invalid of [
    'main',
    '../profile',
    '00000000000000000000000000000000',
    '0123456789AB4def8123456789abcdef',
    '0123456789ab4def7123456789abcdef',
    undefined,
  ]) {
    assert.throws(() => connections.checkProfileId(invalid));
  }
});

test('server urls are normalised without credentials (same as the Tauri build)', () => {
  assert.equal(connections.normalizeServer('matrix.example.org/'), 'https://matrix.example.org');
  assert.equal(connections.normalizeServer('http://127.0.0.1:8008/'), 'http://127.0.0.1:8008');
  assert.equal(connections.normalizeServer('http://[::1]:8008'), 'http://[::1]:8008');
  assert.equal(connections.normalizeServer('HTTPS://Matrix.Example.org'), 'https://matrix.example.org');
  for (const invalid of [
    '',
    'http://matrix.example.org',
    'http://127.example.org',
    'https://user:password@example.org',
    'https://example.org/?token=example',
    'file:///data',
    'https://example.org/#login',
  ]) {
    assert.throws(() => connections.normalizeServer(invalid), invalid);
  }
});

test('profiles are saved, read back and validated', () => {
  const dir = tempDir();
  assert.deepEqual(connections.readProfiles(dir), []);
  const profiles = [{ id: ID, server: 'https://matrix.example.org' }];
  connections.saveProfiles(dir, profiles);
  assert.deepEqual(connections.readProfiles(dir), profiles);
  assert.equal(fs.statSync(path.join(dir, 'connections.json')).mode & 0o777, 0o600);
  fs.writeFileSync(path.join(dir, 'connections.json'), JSON.stringify([{ id: ID, server: 'http://evil.example' }]));
  assert.throws(() => connections.readProfiles(dir));
  fs.writeFileSync(path.join(dir, 'connections.json'), JSON.stringify([...profiles, ...profiles]));
  assert.throws(() => connections.readProfiles(dir), /Doppelte/);
});

test('removing a profile refuses the original login and unknown ids', () => {
  const profiles = [{ id: ID, server: 'https://matrix.example.org' }];
  assert.deepEqual(connections.removeProfile(profiles, ID), []);
  assert.throws(() => connections.removeProfile(profiles, 'main'));
  assert.throws(() => connections.removeProfile(profiles, 'fedcba9876544321a123456789abcdef'));
});

test('launch options: normal launch, new or reopened profile, invalid input', () => {
  assert.equal(connections.parseLaunch(['/usr/bin/electron', '/app']), undefined);
  assert.deepEqual(
    connections.parseLaunch(['diddy', '--connection-id', ID, '--connection-server', 'http://127.0.0.1:8008/']),
    { id: ID, server: 'http://127.0.0.1:8008' }
  );
  assert.deepEqual(connections.parseLaunch(['diddy', '--connection-id', ID]), { id: ID, server: undefined });
  for (const args of [
    ['--connection-id', 'main', '--connection-server', 'http://127.0.0.1:8008'],
    ['--connection-server', 'http://127.0.0.1:8008'],
    ['--connection-id', '../data'],
    ['--connection-id', ID, '--connection-server', 'https://user:fixture@example.org'],
    ['--connection-id'],
    ['--connection-id', 'main', '--connection-id', 'main'],
    ['--connection-id', 'main', '--connection-server'],
  ]) {
    assert.throws(() => connections.parseLaunch(args), args.join(' '));
  }
});

test('window rectangles are fitted into the screen', () => {
  const area = { x: 0, y: 30, width: 1920, height: 1050 };
  assert.deepEqual(fitIntoArea({ x: 100, y: 80, width: 1200, height: 800 }, area), {
    x: 100,
    y: 80,
    width: 1200,
    height: 800,
  });
  // #26: 2991 wide at x=742 on a 1920 wide display
  assert.deepEqual(fitIntoArea({ x: 742, y: 30, width: 2991, height: 1050 }, area), {
    x: 0,
    y: 30,
    width: 1920,
    height: 1050,
  });
  assert.equal(parseWindowState('{"x":1,"y":2,"width":900,"height":700}').maximized, false);
  assert.equal(parseWindowState('{"x":1,"y":2,"width":50,"height":700}'), undefined);
  assert.equal(parseWindowState('nonsense'), undefined);
});

test('myinstants: only https on myinstants.com, redirects stay there, audio type and size checked', async () => {
  assert.throws(() => myinstants.checkedUrl('http://www.myinstants.com/x'));
  assert.throws(() => myinstants.checkedUrl('https://evil.example/x'));
  assert.equal(myinstants.checkedUrl('https://myinstants.com/x').hostname, 'myinstants.com');

  const reply = (status, headers, body = '') => new Response(status >= 300 && status < 400 ? null : body, { status, headers });
  const fetchHtml = async (url) =>
    url.pathname === '/start'
      ? reply(302, { location: '/page' })
      : reply(200, { 'content-type': 'text/html' }, '<html>ok</html>');
  assert.equal(await myinstants.fetchText('https://www.myinstants.com/start', fetchHtml), '<html>ok</html>');

  const offsite = async () => reply(302, { location: 'https://evil.example/' });
  await assert.rejects(myinstants.fetchText('https://www.myinstants.com/a', offsite), /302/);

  const notAudio = async () => reply(200, { 'content-type': 'text/html' }, 'x');
  await assert.rejects(myinstants.fetchAudio('https://www.myinstants.com/a.mp3', notAudio), /not an audio/);

  const audio = async () => reply(200, { 'content-type': 'audio/mpeg' }, new Uint8Array([1, 2, 3]));
  const buffer = await myinstants.fetchAudio('https://www.myinstants.com/a.mp3', audio);
  assert.ok(buffer instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3]);

  const huge = async () =>
    reply(200, { 'content-type': 'audio/mpeg', 'content-length': String(myinstants.MAX_AUDIO_BYTES + 1) }, 'x');
  await assert.rejects(myinstants.fetchAudio('https://www.myinstants.com/a.mp3', huge), /too large/);
});

test('static files: real types, client routes, no escaping the folder', () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, 'index.html'), 'app');
  fs.mkdirSync(path.join(root, 'public', 'element-call'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'element-call', 'index.html'), 'call');
  fs.writeFileSync(path.join(root, 'crypto.wasm'), 'wasm');
  assert.equal(contentType('a/crypto.wasm'), 'application/wasm');
  assert.equal(contentType('sw.js'), 'text/javascript; charset=utf-8');
  assert.equal(resolveFile(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveFile(root, '/public/element-call/index.html?x=1'), path.join(root, 'public', 'element-call', 'index.html'));
  assert.equal(resolveFile(root, '/public/element-call/'), path.join(root, 'public', 'element-call', 'index.html'));
  assert.equal(resolveFile(root, '/login/server'), path.join(root, 'index.html'));
  assert.equal(resolveFile(root, '/missing.js'), undefined);
  for (const evil of ['/../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc', '/a%00.js', '/%E0%A4%A']) {
    const resolved = resolveFile(root, evil);
    assert.ok(resolved === undefined || resolved.startsWith(root), evil);
  }
});

test('static server answers only for its own host name and only GET/HEAD', async () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, 'index.html'), 'app');
  fs.writeFileSync(path.join(root, 'crypto.wasm'), 'wasm');
  const port = 40000 + Math.floor(Math.random() * 20000);
  const server = await startStaticServer(root, port);
  const request = (method, file, host) =>
    new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: file, headers: { host } }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
      });
      req.on('error', reject);
      req.end();
    });
  try {
    const ok = await request('GET', '/crypto.wasm', `localhost:${port}`);
    assert.deepEqual([ok.status, ok.type, ok.body], [200, 'application/wasm', 'wasm']);
    assert.equal((await request('GET', '/', `127.0.0.1:${port}`)).body, 'app');
    assert.equal((await request('GET', '/', 'evil.example')).status, 421);
    assert.equal((await request('POST', '/', `localhost:${port}`)).status, 405);
    assert.equal((await request('GET', '/nope.js', `localhost:${port}`)).status, 404);
    await assert.rejects(startStaticServer(root, port), /EADDRINUSE/);
  } finally {
    server.close();
  }
});

test('agent voice trigger (#57): launch options and state', () => {
  assert.equal(parseAgentVoiceLaunch(['diddy']), undefined);
  assert.equal(parseAgentVoiceLaunch(['diddy', '--connection-id', 'main']), undefined);
  assert.deepEqual(parseAgentVoiceLaunch(['diddy', '--agent-voice', 'start']), { command: 'start' });
  assert.ok(parseAgentVoiceLaunch(['diddy', '--agent-voice']).error);
  assert.ok(parseAgentVoiceLaunch(['diddy', '--agent-voice', 'now']).error);

  const trigger = createAgentVoiceTrigger();
  assert.deepEqual(trigger.state(), { key: null, trigger: false });
  assert.equal(trigger.apply('start'), true);
  assert.equal(trigger.apply('toggle'), false);
  assert.equal(trigger.apply('toggle'), true);
  assert.equal(trigger.apply('stop'), false);
  assert.deepEqual(trigger.state(), { key: null, trigger: false });
});

// Single sign-on (review): the flow runs in a child window and comes back into the main window.
test('single sign-on start addresses are recognised, other links are not', () => {
  const { isSsoStart } = require('../lib/ssoWindow.cjs');
  assert.equal(isSsoStart('https://matrix.example.org/_matrix/client/v3/login/sso/redirect?redirectUrl=x'), true);
  assert.equal(isSsoStart('https://matrix.example.org/_matrix/client/r0/login/sso/redirect/oidc-google?redirectUrl=x'), true);
  assert.equal(isSsoStart('https://example.org/some/page'), false);
  assert.equal(isSsoStart('file:///_matrix/client/v3/login/sso/redirect'), false);
  assert.equal(isSsoStart('not a url'), false);
});

test('the sign-on window hands the first app address to the main window and closes', () => {
  const { openSsoWindow } = require('../lib/ssoWindow.cjs');
  const handlers = {};
  let closed = false;
  let loaded;
  class FakeWindow {
    constructor() {
      this.webContents = {
        on: (name, fn) => { handlers[name] = fn; },
        setWindowOpenHandler: () => undefined,
      };
    }
    loadURL() { return Promise.resolve(); }
    isDestroyed() { return false; }
    close() { closed = true; }
  }
  const parent = { webContents: { session: {} }, isDestroyed: () => false, loadURL: (u) => { loaded = u; return Promise.resolve(); } };
  const appOrigin = 'http://localhost:44548';
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };
  openSsoWindow({ BrowserWindow: FakeWindow, shell: {}, parent, url: 'https://hs/_matrix/client/v3/login/sso/redirect', appOrigin, originOf });
  let prevented = false;
  handlers['will-redirect']({ preventDefault: () => { prevented = true; } }, 'https://idp.example/login');
  assert.equal(prevented, false);
  handlers['will-redirect']({ preventDefault: () => { prevented = true; } }, `${appOrigin}/?loginToken=abc`);
  assert.equal(prevented, true);
  assert.equal(loaded, `${appOrigin}/?loginToken=abc`);
  assert.equal(closed, true);
});

test('link previews: only public pages, redirects checked, HTML only, size capped (#197)', async () => {
  for (const host of ['example.com', '8.8.8.8', '[2001:4860::8888]']) assert.equal(linkPreview.isPublicHost(host), true, host);
  for (const host of ['localhost', 'router', 'nas.local', '10.0.0.1', '192.168.178.62', '172.20.0.1', '[::1]', '[fd00::1]']) {
    assert.equal(linkPreview.isPublicHost(host), false, host);
  }
  await assert.rejects(linkPreview.fetchPage('http://192.168.0.1/'), /public/);
  await assert.rejects(linkPreview.fetchPage('file:///etc/passwd'), /public/);

  const reply = (status, headers, body = '') => new Response(status >= 300 && status < 400 ? null : body, { status, headers });
  const html = async (url) =>
    url.pathname === '/start' ? reply(301, { location: '/page' }) : reply(200, { 'content-type': 'text/html; charset=utf-8' }, '<head><title>ok</title></head>');
  assert.equal(await linkPreview.fetchPage('https://example.com/start', html), '<head><title>ok</title></head>');

  const intoLan = async () => reply(302, { location: 'http://192.168.0.1/admin' });
  await assert.rejects(linkPreview.fetchPage('https://example.com/a', intoLan), /302/);

  const image = async () => reply(200, { 'content-type': 'image/png' }, 'x');
  await assert.rejects(linkPreview.fetchPage('https://example.com/a', image), /not a web page/);

  const big = async () => reply(200, { 'content-type': 'text/html' }, 'a'.repeat(linkPreview.MAX_BYTES + 5000));
  assert.equal((await linkPreview.fetchPage('https://example.com/a', big)).length, linkPreview.MAX_BYTES);
});

test('hashed build files stay cached, the page shell and config follow updates at once', () => {
  assert.equal(cacheControl('/assets/index-BsyCF7gU.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('/assets/matrix_sdk_crypto_wasm_bg-DwIieW7K.wasm'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('/public/element-call/assets/index-Dul-9Slf.js?v=1'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControl('/'), 'no-cache');
  assert.equal(cacheControl('/index.html'), 'no-cache');
  assert.equal(cacheControl('/sw.js'), 'no-cache');
  assert.equal(cacheControl('/config.json'), 'no-cache');
  assert.equal(cacheControl('/public/element-call/index.html'), 'no-cache');
  assert.equal(cacheControl('/assets/unhashed.js'), 'public, max-age=3600');
  assert.equal(cacheControl('/manifest.json'), 'public, max-age=3600');
});
