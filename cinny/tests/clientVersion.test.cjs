// #75: Diddy clients write their version into the profile, other Diddy clients show it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dir = path.join(__dirname, '../src/app/plugins/diddy');
const cache = {};
const load = (name) => {
  if (cache[name]) return cache[name];
  const code = ts.transpileModule(fs.readFileSync(path.join(dir, `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const mod = {};
  cache[name] = mod;
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    console,
    require: (id) => load(id.replace('./', '')),
  });
  return mod;
};
const { safeVersion, stampClientVersion, clientVersionOutdated } = load('clientVersion');
const { sanitizeProfile } = load('sanitize');
const plain = (v) => JSON.parse(JSON.stringify(v));

test('only plain version numbers are accepted', () => {
  assert.equal(safeVersion('1.3.2'), '1.3.2');
  assert.equal(safeVersion('10.0.0-beta.1'), '10.0.0-beta.1');
  assert.equal(safeVersion('v1.3.2'), undefined);
  assert.equal(safeVersion('1.3'), undefined);
  assert.equal(safeVersion('1.3.2 <img src=x>'), undefined);
  assert.equal(safeVersion(`1.3.2-${'a'.repeat(30)}`), undefined);
  assert.equal(safeVersion(132), undefined);
  assert.equal(safeVersion(undefined), undefined);
});

test('the receiving side keeps a valid version and drops anything else', () => {
  assert.equal(sanitizeProfile({ v: 1, clientVersion: '1.3.2' }).clientVersion, '1.3.2');
  assert.equal(sanitizeProfile({ v: 1, clientVersion: 'evil' }).clientVersion, undefined);
  assert.equal('clientVersion' in sanitizeProfile({ v: 1, bio: 'hi' }), false);
});

test('every write carries the version, or none when sharing is off', () => {
  const profile = { v: 1, bio: 'Hallo', clientVersion: '1.2.0' };
  assert.deepEqual(plain(stampClientVersion(profile, '1.3.2')), {
    v: 1,
    bio: 'Hallo',
    clientVersion: '1.3.2',
  });
  assert.deepEqual(plain(stampClientVersion(profile, undefined)), { v: 1, bio: 'Hallo' });
  assert.equal('clientVersion' in stampClientVersion(profile, undefined), false);
  // the input is left alone
  assert.equal(profile.clientVersion, '1.2.0');
});

test('the profile is rewritten only when it says something else than it should', () => {
  assert.equal(clientVersionOutdated({ v: 1, clientVersion: '1.3.2' }, '1.3.2'), false);
  assert.equal(clientVersionOutdated({ v: 1, clientVersion: '1.3.1' }, '1.3.2'), true);
  assert.equal(clientVersionOutdated({ v: 1 }, '1.3.2'), true);
  assert.equal(clientVersionOutdated(undefined, '1.3.2'), true);
  // sharing off: only a stored version needs removing
  assert.equal(clientVersionOutdated({ v: 1, clientVersion: '1.3.2' }, undefined), true);
  assert.equal(clientVersionOutdated({ v: 1 }, undefined), false);
  assert.equal(clientVersionOutdated(undefined, undefined), false);
});
