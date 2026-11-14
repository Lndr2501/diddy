const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/toDeviceBuffer.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const { createToDeviceBuffer } = mod;

test('call keys wait until the call page may receive them, then go in order', () => {
  let ready = false;
  const buffer = createToDeviceBuffer(() => ready);
  assert.equal(buffer.hold('key-1'), true);
  assert.equal(buffer.hold('key-2'), true);
  assert.equal(buffer.size(), 2);
  ready = true;
  assert.equal(buffer.hold('key-3'), false, 'once allowed, messages go straight through');
  assert.deepEqual([...buffer.take()], ['key-1', 'key-2']);
  assert.equal(buffer.size(), 0);
});

test('a page that never starts keeps only the newest messages', () => {
  const buffer = createToDeviceBuffer(() => false, 3);
  ['a', 'b', 'c', 'd', 'e'].forEach((m) => buffer.hold(m));
  assert.deepEqual([...buffer.take()], ['c', 'd', 'e']);
});
