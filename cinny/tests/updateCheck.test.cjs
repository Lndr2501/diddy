// #120: pure update-check logic (repo validation, release parsing, asset choice).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const load = (file, deps = {}) => {
  const filename = path.join(__dirname, '../src/app/utils', file);
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const exported = {};
  vm.runInNewContext(out, { exports: exported, URL, require: (id) => deps[id] }, { filename });
  return exported;
};
const version = load('version.ts');
const u = load('updateCheck.ts', { './version': version });

test('repo validation accepts owner/name only', () => {
  assert.equal(u.isValidUpdateRepo('Lndr2501/diddy'), true);
  assert.equal(u.isValidUpdateRepo('a-b/some_repo.js'), true);
  for (const bad of ['', 'diddy', 'a/b/c', '/x', 'x/', '-a/b', 'a/..', 'a b/c', 'https://github.com/a/b', 'a/b?x=1']) {
    assert.equal(u.isValidUpdateRepo(bad), false, bad);
  }
  assert.equal(u.effectiveUpdateRepo('nonsense'), 'Lndr2501/diddy');
  assert.equal(u.effectiveUpdateRepo(' me/fork '), 'me/fork');
});

test('release JSON is parsed, drafts and prereleases are ignored', () => {
  const rel = u.parseRelease(
    {
      tag_name: 'v1.4.1',
      html_url: 'https://github.com/Lndr2501/diddy/releases/tag/v1.4.1',
      body: 'Fixes',
      assets: [
        { name: 'Diddy_1.4.1_aarch64.dmg', browser_download_url: 'https://github.com/x/y/releases/download/v1.4.1/Diddy_1.4.1_aarch64.dmg', size: 5 },
        { name: 'evil.dmg', browser_download_url: 'https://evil.example/evil.dmg', size: 1 },
      ],
    },
    'Lndr2501/diddy'
  );
  assert.equal(rel.version, '1.4.1');
  assert.equal(rel.assets.length, 1);
  assert.equal(u.parseRelease({ tag_name: 'v2.0.0', prerelease: true }, 'a/b'), undefined);
  assert.equal(u.parseRelease({ tag_name: 'v2.0.0', draft: true }, 'a/b'), undefined);
  assert.equal(u.parseRelease({ tag_name: 'nightly' }, 'a/b'), undefined);
  assert.equal(u.parseRelease(null, 'a/b'), undefined);
  assert.equal(u.parseRelease({ tag_name: '1.0.0', html_url: 'http://evil/x' }, 'a/b').pageUrl, 'https://github.com/a/b/releases/latest');
});

test('asset choice follows platform and architecture', () => {
  const assets = [
    { name: 'Diddy_1.4.1_aarch64.dmg', url: 'u1', size: 1 },
    { name: 'Diddy_1.4.1_x86_64.AppImage', url: 'u2', size: 1 },
    { name: 'Diddy_1.4.1_x86_64.dmg', url: 'u3', size: 1 },
  ];
  assert.equal(u.pickAsset(assets, 'mac', 'arm64').url, 'u1');
  assert.equal(u.pickAsset(assets, 'mac', 'x64').url, 'u3');
  assert.equal(u.pickAsset(assets, 'linux', 'x64').url, 'u2');
  assert.equal(u.pickAsset(assets.slice(0, 1), 'mac', 'x64'), undefined);
  assert.equal(u.pickAsset(assets, 'other'), undefined);
});

test('an update is wanted only when newer and not skipped', () => {
  assert.equal(u.isUpdateWanted('1.4.1', '1.4.0'), true);
  assert.equal(u.isUpdateWanted('1.4.0', '1.4.0'), false);
  assert.equal(u.isUpdateWanted('1.10.0', '1.9.9'), true);
  assert.equal(u.isUpdateWanted('1.4.1', '1.4.0', '1.4.1'), false);
});
