// Full mute holds until you lift it yourself (#225).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/deafenGuard.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const plain = (value) => JSON.parse(JSON.stringify(value));

test('deafened audio elements are muted again whenever something unmuted them', () => {
  assert.deepEqual(plain(mod.audioMuteStep(true, undefined, false)), { applied: true, muted: true });
  // already applied, but the call reset `muted` (for example when a stream started)
  assert.deepEqual(plain(mod.audioMuteStep(true, true, false)), { applied: true, muted: true });
  assert.deepEqual(plain(mod.audioMuteStep(true, true, true)), { applied: true });
});

test('lifting the deafen unmutes only what it muted; per-user mutes stay', () => {
  assert.deepEqual(plain(mod.audioMuteStep(false, true, true)), { applied: false, muted: false });
  assert.deepEqual(plain(mod.audioMuteStep(false, undefined, true)), { applied: false });
  assert.deepEqual(plain(mod.audioMuteStep(false, false, true)), { applied: false });
});

test('only a microphone you asked for lifts the deafen', () => {
  assert.equal(mod.pageMicDecision(true, true, true), 'undeafen');
  // the page switched the microphone on by itself (a stream started)
  assert.equal(mod.pageMicDecision(true, true, false), 'remute');
  assert.equal(mod.pageMicDecision(true, true, undefined), 'remute');
  assert.equal(mod.pageMicDecision(true, false, false), 'accept');
  assert.equal(mod.pageMicDecision(false, true, false), 'accept');
  assert.equal(mod.pageMicDecision(true, undefined, false), 'accept');
});
