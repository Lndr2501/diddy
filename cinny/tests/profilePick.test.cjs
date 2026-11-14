// Profile sync between devices (#207): the newest own profile of all options rooms wins.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/diddy/profilePick.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, Number }, { filename });

const sanitize = (content) =>
  content && content.v === 1 ? { font: content.font ?? 'default' } : undefined;

test('a newer profile in a later room beats an older one in the first room', () => {
  // the phone reads a light room first that still has the default profile from months ago,
  // the desktop wrote the new banner and font into its own options room
  const phoneRooms = [
    { content: { v: 1 }, ts: 1000 },
    { content: { v: 1, font: 'serif' }, ts: 5000 },
  ];
  assert.deepEqual({ ...mod.pickNewestProfile(phoneRooms, sanitize) }, { font: 'serif' });
});

test('rooms without a profile and invalid newer profiles are skipped', () => {
  const rooms = [
    undefined,
    { content: { v: 1, font: 'mono' }, ts: 2000 },
    { content: { v: 2 }, ts: 9000 },
  ];
  assert.deepEqual({ ...mod.pickNewestProfile(rooms, sanitize) }, { font: 'mono' });
  assert.equal(mod.pickNewestProfile([], sanitize), undefined);
  assert.equal(mod.pickNewestProfile([undefined, { content: null, ts: 1 }], sanitize), undefined);
  assert.equal(mod.pickNewestProfile([{ content: { v: 1 }, ts: NaN }], sanitize), undefined);
});

test('on equal times the first room in order wins, like before', () => {
  const rooms = [
    { content: { v: 1, font: 'first' }, ts: 3000 },
    { content: { v: 1, font: 'second' }, ts: 3000 },
  ];
  assert.deepEqual({ ...mod.pickNewestProfile(rooms, sanitize) }, { font: 'first' });
});

test('desktop reads profiles through the newest pick', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/app/plugins/diddy/profiles.ts'), 'utf8');
  assert.match(src, /pickNewestProfile\(\s*getOptionsRooms\(mx\)/);
});

test('iOS resolves profiles the same way', (t) => {
  const swift = path.join(__dirname, '../../ios/Diddy/Matrix/DiddyProfiles.swift');
  if (!fs.existsSync(swift)) {
    t.skip('ios/ is not part of this tree');
    return;
  }
  const src = fs.readFileSync(swift, 'utf8');
  assert.match(src, /DiddyProfilePick\.newest/);
});
