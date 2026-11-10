// Run from electron/: node --test tests/*.test.cjs
// Linux shell features that cannot be tried on X11/Wayland here (#137): microphone permission (voice
// messages, calls), separate logins (connection profiles) and the app icon, with Electron faked.
// This proves the logic and the packaging, not the look of a real window; see the manual checklist in the docs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const connections = require('../lib/connections.cjs');
const { createConnectionWindows } = require('../lib/connectionWindows.cjs');
const { ICON_IDS, createAppIcons } = require('../lib/appIcon.cjs');
const permissions = require('../lib/permissions.cjs');

// The Nix check phase only sees electron/ and src-tauri/app-icons: checks that read the rest of the repo skip there.
const REPO = path.join(__dirname, '../..');
const fullCheckout = fs.existsSync(path.join(REPO, 'cinny/src')) && fs.existsSync(path.join(REPO, 'nix/package.nix'));
const needsCheckout = fullCheckout ? {} : { skip: 'needs the full repository (cinny/, nix/)' };

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-linux-'));
const ORIGIN = 'http://localhost:44548';
const A = '0123456789ab4def8123456789abcdef';
const B = 'fedcba9876544def9edcba9876543210';

// ---- microphone permission (voice messages record through getUserMedia) -------------------------

test('microphone: Diddy and Element Call get it, other origins and other permissions do not', () => {
  let request;
  let check;
  permissions.configurePermissions({
    setPermissionRequestHandler: (handler) => { request = handler; },
    setPermissionCheckHandler: (handler) => { check = handler; },
  }, ORIGIN);
  const ask = (permission, requestingUrl) => { let answer; request({}, permission, (value) => { answer = value; }, { requestingUrl }); return answer; };
  assert.equal(ask('media', `${ORIGIN}/`), true);
  assert.equal(ask('media', `${ORIGIN}/element-call/index.html#/room`), true); // call frame, same origin
  assert.equal(ask('media', 'https://evil.example/'), false);
  assert.equal(ask('media', 'http://localhost:44549/'), false);
  assert.equal(ask('media', ''), false);
  assert.equal(ask('geolocation', `${ORIGIN}/`), false);
  assert.equal(ask('openExternal', `${ORIGIN}/`), false);
  assert.equal(check({}, 'media', `${ORIGIN}/`), true);
  assert.equal(check({}, 'media', 'https://evil.example'), false);
  assert.equal(check({}, 'midi', `${ORIGIN}/`), false);
  for (const wanted of ['media', 'display-capture', 'notifications']) assert.ok(permissions.MEDIA_PERMISSIONS.has(wanted));
});

// ---- app icon ------------------------------------------------------------------------------------

const fakeImage = (empty = false) => ({ isEmpty: () => empty });
const iconFixture = ({ missing = [] } = {}) => {
  const config = tempDir();
  const set = [];
  const windows = new Map([['main', { setIcon: (image) => set.push(['main', image]) }], ['connection-x', { setIcon: (image) => set.push(['x', image]) }]]);
  const logs = [];
  const icons = createAppIcons({
    iconsDir: '/icons',
    configDir: () => config,
    nativeImage: { createFromPath: (file) => (missing.some((id) => file.endsWith(`${id}.png`)) ? fakeImage(true) : { file, ...fakeImage() }) },
    windows,
    log: (line) => logs.push(line),
  });
  return { config, set, icons, logs };
};

test('app icon: all ids exist and are shipped by the Linux package and the Nix package', needsCheckout, () => {
  const root = path.join(__dirname, '../..');
  for (const id of ICON_IDS) assert.ok(fs.existsSync(path.join(root, 'src-tauri/app-icons', `${id}.png`)), id);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'electron/package.json'), 'utf8'));
  assert.ok(pkg.build.extraResources.some((r) => r.from === '../src-tauri/app-icons' && r.to === 'app-icons'));
  const nix = fs.readFileSync(path.join(root, 'nix/package.nix'), 'utf8');
  assert.ok(nix.includes(`src-tauri/app-icons/{${ICON_IDS.join(',')}}.png`), 'nix copies every icon');
  // same ids as the page and the Tauri build
  const page = fs.readFileSync(path.join(root, 'cinny/src/app/plugins/appIcon.ts'), 'utf8');
  assert.ok(page.includes(`APP_ICON_IDS: AppIconId[] = [${ICON_IDS.map((id) => `'${id}'`).join(', ')}]`));
});

test('app icon: applied to every open window, saved, used for the next window', () => {
  const { config, set, icons } = iconFixture();
  assert.equal(icons.saved(), undefined);
  assert.equal(icons.forNewWindow().file, path.join('/icons', 'pink.png'));
  icons.set('blue', true);
  assert.equal(set.length, 2);
  assert.equal(fs.readFileSync(path.join(config, 'app-icon'), 'utf8'), 'blue');
  assert.equal(icons.saved(), 'blue');
  assert.equal(icons.forNewWindow().file, path.join('/icons', 'blue.png'));
  icons.set('black', false); // applying at start does not rewrite the choice
  assert.equal(icons.saved(), 'blue');
});

test('app icon: unknown ids, broken saved value and missing image files', () => {
  const { config, icons, logs } = iconFixture({ missing: ['purple'] });
  assert.throws(() => icons.set('../../etc/passwd', true), /unknown icon/);
  assert.throws(() => icons.set('rainbow', true), /unknown icon/);
  assert.equal(fs.existsSync(path.join(config, 'app-icon')), false);
  fs.writeFileSync(path.join(config, 'app-icon'), 'rainbow\n');
  assert.equal(icons.saved(), undefined);
  icons.set('purple', true); // not found: logged, the choice is still kept
  assert.match(logs.join('\n'), /purple\.png not found/);
  assert.equal(icons.saved(), 'purple');
});

// ---- connection profiles --------------------------------------------------------------------------

const connectionFixture = () => {
  const dir = tempDir();
  const userData = tempDir();
  const windows = new Map();
  const events = [];
  const created = [];
  const manager = createConnectionWindows({
    connections,
    configDir: () => dir,
    windows,
    createWindow: (label, profile) => {
      created.push([label, profile]);
      windows.set(label, { destroy: () => { events.push(`destroy ${label}`); windows.delete(label); } });
      if (profile.server.includes('broken')) { windows.delete(label); throw new Error('window failed'); }
    },
    focusWindow: (win) => events.push(`focus ${[...windows].find(([, w]) => w === win)?.[0]}`),
    focusMain: () => events.push('focus main'),
    session: { fromPartition: (name) => ({ clearStorageData: async () => events.push(`clear ${name}`), clearCache: async () => events.push(`cache ${name}`) }) },
    userDataDir: () => userData,
    log: (line) => events.push(`log ${line}`),
  });
  return { dir, userData, windows, events, created, manager };
};

test('connection profiles: a new login gets its own window and is saved; reopening focuses it', () => {
  const f = connectionFixture();
  f.manager.open({ id: A, server: 'matrix.example.org' });
  assert.deepEqual(f.created, [[`connection-${A}`, { id: A, server: 'https://matrix.example.org' }]]);
  assert.deepEqual(connections.readProfiles(f.dir), [{ id: A, server: 'https://matrix.example.org' }]);
  f.manager.open({ id: A }); // by id only, like the profile list does
  f.manager.open({ id: A, server: 'https://matrix.example.org/' });
  assert.equal(f.created.length, 1);
  assert.equal(f.events.filter((e) => e === `focus connection-${A}`).length, 2);
  assert.throws(() => f.manager.open({ id: A, server: 'https://other.example' }), /anderen Server/);
  // a second profile is separate: its own label, so its own partition `persist:connection-<id>`
  f.manager.open({ id: B, server: 'http://localhost:8008' });
  assert.equal(connections.readProfiles(f.dir).length, 2);
  assert.notEqual(f.created[0][0], f.created[1][0]);
});

test('connection profiles: invalid requests are refused and a failed window saves nothing', () => {
  const f = connectionFixture();
  f.manager.open({ id: 'main' });
  assert.equal(f.events.at(-1), 'focus main');
  assert.throws(() => f.manager.open({ id: 'main', server: 'https://x.example' }), /ursprüngliche/);
  assert.throws(() => f.manager.open({ id: '../evil', server: 'https://x.example' }), /Ungültige/);
  assert.throws(() => f.manager.open({ id: A }), /nicht gespeichert/);
  assert.throws(() => f.manager.open({ id: A, server: 'http://matrix.example.org' }), /HTTPS/);
  assert.throws(() => f.manager.open({ id: A, server: 'https://broken.example' }), /window failed/);
  assert.deepEqual(connections.readProfiles(f.dir), []);
  // the 20-login limit
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `${String(i).padStart(12, '0')}4${'0'.repeat(3)}8${'0'.repeat(15)}`, server: 'https://a.example' }));
  connections.saveProfiles(f.dir, full);
  assert.throws(() => f.manager.open({ id: A, server: 'https://b.example' }), /20 Verbindungen/);
});

test('connection profiles: removing closes the window and deletes that login\'s data only', async () => {
  const f = connectionFixture();
  f.manager.open({ id: A, server: 'https://a.example' });
  f.manager.open({ id: B, server: 'https://b.example' });
  const partitions = path.join(f.userData, 'Partitions');
  for (const id of [A, B]) {
    fs.mkdirSync(path.join(partitions, `connection-${id}`), { recursive: true });
    fs.writeFileSync(path.join(partitions, `connection-${id}`, 'Cookies'), 'x');
  }
  fs.mkdirSync(path.join(partitions, 'other'), { recursive: true });
  await assert.rejects(f.manager.remove({ id: 'main' }), /ursprüngliche/);
  await assert.rejects(f.manager.remove({ id: '0123456789ab4def8123456789abcd00' }), /nicht gespeichert/);
  await f.manager.remove({ id: A });
  assert.ok(f.events.includes(`destroy connection-${A}`));
  assert.ok(f.events.includes(`clear persist:connection-${A}`));
  assert.deepEqual(connections.readProfiles(f.dir), [{ id: B, server: 'https://b.example' }]);
  assert.equal(fs.existsSync(path.join(partitions, `connection-${A}`)), false);
  assert.equal(fs.existsSync(path.join(partitions, `connection-${B}`)), true);
  assert.equal(fs.existsSync(path.join(partitions, 'other')), true);
  assert.ok(f.windows.has(`connection-${B}`));
});

test('connection profiles: the shell and the page agree on names (launch option, command names, partition)', needsCheckout, () => {
  const root = path.join(__dirname, '../..');
  const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  for (const command of ['connection_profiles', 'open_connection_profile', 'remove_connection_profile', 'set_app_icon']) {
    assert.ok(main.includes(`${command}:`), command);
    const page = fs.readdirSync(path.join(root, 'cinny/src/app/plugins')).map((f) => path.join(root, 'cinny/src/app/plugins', f))
      .filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    assert.ok(page.includes(`'${command}'`), `page calls ${command}`);
  }
  assert.equal(connections.parseLaunch(['diddy', '--connection-id', A, '--connection-server', 'https://a.example']).id, A);
});

// ---- packaging ------------------------------------------------------------------------------------

test('every module main.cjs loads ships in the Linux package and the Nix package', needsCheckout, () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
  const required = [...main.matchAll(/require\('\.\/(lib\/[^']+)'\)/g)].map((m) => m[1]);
  assert.ok(required.length > 8);
  for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), file);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.build.files.includes('lib/**'));
  const nix = fs.readFileSync(path.join(root, '../nix/package.nix'), 'utf8');
  assert.match(nix, /cp -r electron\/lib electron\/main\.cjs/);
  // native helpers: built, shipped and found through the same names in the Nix wrapper
  for (const [script, binary, variable] of [['build:audio', 'diddy-system-audio', 'DIDDY_AUDIO_HELPER'], ['build:shortcut', 'diddy-global-shortcut', 'DIDDY_SHORTCUT_HELPER']]) {
    assert.ok(pkg.scripts[script].includes(`native/bin/${binary}`));
    assert.ok(pkg.scripts['dist:linux'].includes(script));
    assert.ok(pkg.build.extraResources.some((r) => r.from === `native/bin/${binary}` && r.to === binary));
    assert.ok(nix.includes(`--set ${variable} $out/libexec/${binary}`));
    assert.ok(main.includes(variable) && main.includes(`'${binary}'`));
  }
});
