// LRU cache for costly pure results (sanitized HTML) and decrypted media object URLs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const load = (file, context) => {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = {};
  vm.runInNewContext(compiled, { exports: mod, ...context });
  return mod;
};
const lru = load('lruCache.ts', {});

test('the least recently used entry is dropped first', () => {
  const evicted = [];
  const c = new lru.LruCache(2, (v, k) => evicted.push(k));
  c.set('a', 1);
  c.set('b', 2);
  assert.equal(c.get('a'), 1); // a is now newer than b
  c.set('c', 3);
  assert.equal(c.has('b'), false);
  assert.equal(c.has('a'), true);
  assert.deepEqual(evicted, ['b']);
  assert.equal(c.size, 2);
});

test('replacing a value releases the old one, delete and clear release too', () => {
  const evicted = [];
  const c = new lru.LruCache(5, (v) => evicted.push(v));
  c.set('a', 1);
  c.set('a', 2);
  c.set('b', 3);
  c.delete('b');
  c.delete('missing');
  c.clear();
  assert.deepEqual(evicted, [1, 3, 2]);
  assert.equal(c.size, 0);
});

test('memoizeString computes each input once', () => {
  let calls = 0;
  const f = lru.memoizeString((s) => { calls += 1; return s.toUpperCase(); }, 2);
  assert.equal(f('x'), 'X');
  assert.equal(f('x'), 'X');
  assert.equal(calls, 1);
  f('y'); f('z'); // x falls out
  f('x');
  assert.equal(calls, 4);
});

test('media cache loads once, retries after a failure, revokes evicted urls', async () => {
  let created = 0;
  const revoked = [];
  const URLStub = { createObjectURL: () => `blob:${(created += 1)}`, revokeObjectURL: (u) => revoked.push(u) };
  const lruSrc = load('lruCache.ts', {});
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils/mediaCache.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = {};
  vm.runInNewContext(compiled, { exports: mod, require: () => lruSrc, URL: URLStub, Promise });
  let loads = 0;
  const blob = () => { loads += 1; return Promise.resolve({}); };
  const a1 = await mod.cachedObjectUrl('mxc://s/a', blob);
  const a2 = await mod.cachedObjectUrl('mxc://s/a', blob);
  assert.equal(a1, a2);
  assert.equal(loads, 1);

  let fail = true;
  const flaky = () => (fail ? Promise.reject(new Error('net')) : Promise.resolve({}));
  await assert.rejects(mod.cachedObjectUrl('mxc://s/b', flaky));
  await new Promise((r) => setTimeout(r, 0));
  fail = false;
  assert.match(await mod.cachedObjectUrl('mxc://s/b', flaky), /^blob:/);

  for (let i = 0; i < 160; i += 1) await mod.cachedObjectUrl(`mxc://s/n${i}`, blob);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(revoked.includes(a1), 'the oldest url is revoked');
});
