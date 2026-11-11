// A person stays "speaking" briefly after the call drops the flag: no flashing between words.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/speakerHold.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const ids = (set) => Array.from(set).sort();

test('a short gap between words does not drop the speaker', () => {
  const hold = mod.createSpeakerHold(600);
  assert.deepEqual(ids(hold.update(new Set(['@a']), 0)), ['@a']);
  assert.deepEqual(ids(hold.update(new Set(), 200)), ['@a'], 'still held');
  assert.deepEqual(ids(hold.update(new Set(['@a']), 300)), ['@a']);
  assert.deepEqual(ids(hold.update(new Set(), 899)), ['@a'], 'held 600 ms after the last time');
  assert.deepEqual(ids(hold.update(new Set(), 901)), []);
});

test('the same Set comes back while nothing changes', () => {
  const hold = mod.createSpeakerHold(600);
  const first = hold.update(new Set(['@a']), 0);
  assert.equal(hold.update(new Set(['@a']), 50), first);
  assert.equal(hold.update(new Set(), 100), first, 'held: unchanged');
  assert.notEqual(hold.update(new Set(), 700), first);
});

test('expiresIn tells when to look again', () => {
  const hold = mod.createSpeakerHold(600);
  assert.equal(hold.expiresIn(0), undefined);
  hold.update(new Set(['@a']), 0);
  hold.update(new Set(), 200);
  assert.equal(hold.expiresIn(200), 400);
  hold.update(new Set(), 700);
  assert.equal(hold.expiresIn(700), undefined);
});
