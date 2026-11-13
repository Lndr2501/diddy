const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/mediaBox.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const fitMediaBox = (...args) => ({ ...mod.fitMediaBox(...args) });

test('a phone screenshot stays small in the chat (#200)', () => {
  assert.deepEqual(fitMediaBox(1080, 2400), { width: 144, height: 320 });
  assert.deepEqual(fitMediaBox(1170, 2532), { width: 148, height: 320 });
});

test('landscape pictures use the full width', () => {
  assert.deepEqual(fitMediaBox(1920, 1080), { width: 400, height: 225 });
  assert.deepEqual(fitMediaBox(4000, 1000), { width: 400, height: 100 });
});

test('small pictures are not blown up, thin ones keep a minimum', () => {
  assert.deepEqual(fitMediaBox(120, 80), { width: 120, height: 80 });
  assert.deepEqual(fitMediaBox(4000, 10), { width: 400, height: 48 });
  assert.deepEqual(fitMediaBox(10, 4000), { width: 48, height: 320 });
});

test('unknown sizes give the largest box', () => {
  assert.deepEqual(fitMediaBox(undefined, undefined), { width: 400, height: 320 });
  assert.deepEqual(fitMediaBox(0, NaN), { width: 400, height: 320 });
});
