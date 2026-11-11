// The AltStore/SideStore source that the release workflow publishes (.github/scripts/altstore-source.cjs).
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.join(__dirname, '../../.github/scripts/altstore-source.cjs');
// The Nix build only copies cinny/ (nix/package.nix frontendSrc), so the script is not there.
const skip = !fs.existsSync(script) && '.github/scripts not in this source tree';
const { buildSource, BUNDLE_ID } = skip ? {} : require(script);

const base = {
  version: '1.5.2',
  ipaName: 'Diddy_1.5.2_iOS_unsigned.ipa',
  size: 1234,
  date: '2026-11-11T12:00:00Z',
  repo: 'Lndr2501/diddy',
  notes: 'Neues Logo',
};

test('links the IPA on the GitHub release by default', { skip }, () => {
  const app = buildSource(base).apps[0];
  assert.equal(app.bundleIdentifier, 'app.diddy.ios');
  assert.equal(app.downloadURL, 'https://github.com/Lndr2501/diddy/releases/download/v1.5.2/Diddy_1.5.2_iOS_unsigned.ipa');
  assert.equal(app.versions[0].downloadURL, app.downloadURL);
  assert.equal(app.versions[0].size, 1234);
  assert.equal(app.versionDate, '2026-11-11T12:00:00.000Z');
});

test('uses the mirror for IPA and icon with --base-url', { skip }, () => {
  const app = buildSource({ ...base, baseUrl: 'https://diddy.example/files/' }).apps[0];
  assert.equal(app.downloadURL, 'https://diddy.example/files/Diddy_1.5.2_iOS_unsigned.ipa');
  assert.equal(app.iconURL, 'https://diddy.example/files/icon.png');
});

test('shortens long release notes and rejects missing data', { skip }, () => {
  const app = buildSource({ ...base, notes: 'x'.repeat(5000) }).apps[0];
  assert.ok(app.versionDescription.length <= 1500);
  assert.throws(() => buildSource({ ...base, size: 0 }));
  assert.throws(() => buildSource({ ...base, version: '' }));
});

test('the bundle id matches the iOS project', { skip }, () => {
  const project = fs.readFileSync(path.join(__dirname, '../../ios/project.yml'), 'utf8');
  assert.ok(project.includes(`PRODUCT_BUNDLE_IDENTIFIER: ${BUNDLE_ID}`));
});

test('the command line writes the file', { skip }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'altstore-'));
  const ipa = path.join(dir, 'Diddy_1.5.2_iOS_unsigned.ipa');
  fs.writeFileSync(ipa, Buffer.alloc(4096));
  fs.writeFileSync(path.join(dir, 'notes.md'), 'Notes');
  const out = path.join(dir, 'altstore.json');
  execFileSync('node', [script, '--version', '1.5.2', '--ipa', ipa, '--repo', 'Lndr2501/diddy',
    '--notes', path.join(dir, 'notes.md'), '--out', out]);
  const json = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(json.apps[0].size, 4096);
  assert.equal(json.apps[0].versionDescription, 'Notes');
});
