// #142: the output volume must not overwrite the volume you gave a person in the call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/outputVolume.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(output, { exports: mod }, { filename });
const { nextElementVolume } = mod;

test('output volume 100 % never touches the remembered level of a returning person', () => {
  const step = nextElementVolume(undefined, 0.4, 1);
  assert.equal(step.write, undefined);
  assert.equal(step.record.user, 0.4);
});

test('a lower output volume scales the person level instead of replacing it', () => {
  const first = nextElementVolume(undefined, 0.5, 0.5);
  assert.equal(first.write, 0.25);
  // unchanged on the next look
  const again = nextElementVolume(first.record, 0.25, 0.5);
  assert.equal(again.write, undefined);
});

test('changing the output volume keeps the person level', () => {
  const first = nextElementVolume(undefined, 0.5, 0.5);
  const raised = nextElementVolume(first.record, 0.25, 1);
  assert.equal(raised.write, 0.5);
});

test('a change of the person slider is taken over as the new level', () => {
  const first = nextElementVolume(undefined, 1, 0.5);
  assert.equal(first.write, 0.5);
  // the call sets 0.8 (slider); then the output volume changes to 100 %
  const unchanged = nextElementVolume(first.record, 0.8, 0.5);
  assert.equal(unchanged.write, undefined);
  const raised = nextElementVolume(unchanged.record, 0.8, 1);
  assert.equal(raised.write, 0.8);
});

test('a person muted for me (0) stays muted and comes back at the same level', () => {
  const first = nextElementVolume(undefined, 0, 0.5);
  assert.equal(first.write, 0);
  const raised = nextElementVolume(first.record, 0, 1);
  assert.equal(raised.write, 0);
});

test('output volume 0 then back restores the level', () => {
  const first = nextElementVolume(undefined, 0.6, 0);
  assert.equal(first.write, 0);
  const back = nextElementVolume(first.record, 0, 1);
  assert.equal(back.write, 0.6);
});

test('values are clamped to 0..1', () => {
  assert.equal(nextElementVolume(undefined, 2, 0.5).write, 0.5);
  assert.equal(nextElementVolume(undefined, 0.5, -1).write, 0);
});
