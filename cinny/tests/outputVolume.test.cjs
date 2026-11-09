// #142: Diddy's output volume must not reset the remembered per-person volume of a new element.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/outputVolume.ts');
const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(out, { exports: mod }, { filename });
const { shouldWriteOutputVolume: should } = mod;

test('a new element at the default output volume keeps the volume the call gave it', () => {
  assert.equal(should(undefined, 1), false);
});

test('a new element is set when the output volume is not the default', () => {
  assert.equal(should(undefined, 0.5), true);
});

test('only a changed preference is written to a known element', () => {
  assert.equal(should(1, 1), false);
  assert.equal(should(0.5, 0.5), false);
  assert.equal(should(1, 0.5), true);
  assert.equal(should(0.5, 1), true);
});
