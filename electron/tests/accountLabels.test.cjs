const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readAccountLabels, setAccountLabel, removeAccountLabel, saveProfiles } = require('../lib/connections.cjs');
const A = '0123456789ab4def8123456789abcdef';
const B = 'fedcba9876544def9edcba9876543210';
const fixture = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-labels-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  saveProfiles(dir, [{ id: A, server: 'https://matrix.example.org' }]);
  return { dir, file: path.join(dir, 'account-labels.json') };
};

test('account labels persist separately from profiles, update and do not rewrite identical labels', (t) => {
  const { dir, file } = fixture(t);
  assert.deepEqual(readAccountLabels(dir), {});
  setAccountLabel(dir, 'main', '@main:example.org');
  setAccountLabel(dir, A, '@first:example.org');
  setAccountLabel(dir, A, '@second:example.org');
  assert.deepEqual(readAccountLabels(dir), { main: '@main:example.org', [A]: '@second:example.org' });
  const before = fs.statSync(file);
  setAccountLabel(dir, A, '@second:example.org');
  assert.equal(fs.statSync(file).ino, before.ino);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(`${file}.new`), false);
});

test('invalid IDs and Matrix IDs are refused without changing saved labels', (t) => {
  const { dir, file } = fixture(t);
  setAccountLabel(dir, 'main', '@main:example.org');
  const before = fs.readFileSync(file, 'utf8');
  for (const [id, user] of [[B, '@x:y'], ['../x', '@x:y'], ['__proto__', '@x:y'], ['main', 'abc'], ['main', '@x:bad server'], ['main', '@x:y\n'], ['main', '@' + 'ä'.repeat(128) + ':y'], ['main', null]]) {
    assert.throws(() => setAccountLabel(dir, id, user));
  }
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('broken, oversized or invalid label files are read defensively', (t) => {
  const { dir, file } = fixture(t);
  for (const raw of ['{bad', '[]', 'null', ' '.repeat(65537)]) {
    fs.writeFileSync(file, raw);
    assert.deepEqual(readAccountLabels(dir), {});
  }
  fs.writeFileSync(file, JSON.stringify({ main: '@ok:example.org', [A]: 'bad', [B]: '@orphan:example.org', '../x': '@x:y' }));
  assert.deepEqual(readAccountLabels(dir), { main: '@ok:example.org' });
});

test('removing a profile erases its label and retains other accounts', (t) => {
  const { dir, file } = fixture(t);
  setAccountLabel(dir, 'main', '@main:example.org');
  setAccountLabel(dir, A, '@other:example.org');
  saveProfiles(dir, []);
  assert.deepEqual(readAccountLabels(dir), { main: '@main:example.org' });
  removeAccountLabel(dir, A);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { main: '@main:example.org' });
});
