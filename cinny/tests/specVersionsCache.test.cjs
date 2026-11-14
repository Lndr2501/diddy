// The client starts with the last /versions answer instead of waiting for the server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const mod = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils/specVersionsCache.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  { exports: mod }
);
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

test('an answer is kept per server and read back', () => {
  const s = memory();
  mod.writeCachedSpecVersions(s, 'https://a.example', { versions: ['v1.11'], unstable_features: { x: true } });
  assert.deepEqual(JSON.parse(JSON.stringify(mod.readCachedSpecVersions(s, 'https://a.example'))), {
    versions: ['v1.11'],
    unstable_features: { x: true },
  });
  assert.equal(mod.readCachedSpecVersions(s, 'https://b.example'), undefined);
});

test('broken or foreign data is ignored, failing storage does not throw', () => {
  const s = memory();
  s.setItem('diddy-spec-versions:https://a.example', '{"versions":[1]}');
  assert.equal(mod.readCachedSpecVersions(s, 'https://a.example'), undefined);
  s.setItem('diddy-spec-versions:https://a.example', 'not json');
  assert.equal(mod.readCachedSpecVersions(s, 'https://a.example'), undefined);
  mod.writeCachedSpecVersions(s, 'https://a.example', { versions: 'nope' });
  assert.equal(s.m.get('diddy-spec-versions:https://a.example'), 'not json');
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(mod.readCachedSpecVersions(broken, 'x'), undefined);
  mod.writeCachedSpecVersions(broken, 'x', { versions: [] });
  assert.equal(mod.readCachedSpecVersions(undefined, 'x'), undefined);
});
