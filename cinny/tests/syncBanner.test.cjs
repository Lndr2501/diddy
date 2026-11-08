const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/syncBanner.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const { syncBanner } = mod;

test('no banner once the client is syncing (a response arrived)', () => {
  assert.equal(syncBanner('SYNCING'), null);
});

test('connecting banner only while preparing or catching up', () => {
  assert.equal(syncBanner('PREPARED'), 'connecting');
  assert.equal(syncBanner('CATCHUP'), 'connecting');
});

test('warning and error banners', () => {
  assert.equal(syncBanner('RECONNECTING'), 'reconnecting');
  assert.equal(syncBanner('ERROR'), 'error');
});

test('no banner before the first state and when stopped', () => {
  assert.equal(syncBanner(null), null);
  assert.equal(syncBanner(undefined), null);
  assert.equal(syncBanner('STOPPED'), null);
});
