// One entry per person in a call, also with several devices (computer + iPhone as camera & mic).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/callPeople.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });

test('two devices of one person count once, in the order of the first', () => {
  const a1 = { userId: '@a:hs', deviceId: 'DESK' };
  const b = { userId: '@b:hs', deviceId: 'X' };
  const a2 = { userId: '@a:hs', deviceId: 'PHONE' };
  const result = mod.onePerPerson([a1, b, a2]);
  assert.equal(result.length, 2);
  assert.equal(result[0], a1);
  assert.equal(result[1], b);
});

test('without duplicates the same array comes back', () => {
  const list = [{ userId: '@a:hs' }, { userId: '@b:hs' }, {}];
  assert.equal(mod.onePerPerson(list), list);
});
