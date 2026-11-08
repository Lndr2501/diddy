// #76: Diddy decides from your microphone level whether you are talking.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/app/plugins/call/voiceActivity.ts');

function load() {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = {};
  vm.runInNewContext(code, { exports: mod });
  return mod;
}

const sine = (amplitude, n = 1024) =>
  Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin((2 * Math.PI * i) / 32));

test('levelDb: silence, full scale and a quiet signal', () => {
  const { levelDb, SILENCE_DB } = load();
  assert.equal(levelDb(new Float32Array(0)), SILENCE_DB);
  assert.equal(levelDb(new Float32Array(1024)), SILENCE_DB);
  // a full-scale square wave has an RMS of 1, so 0 dBFS
  assert.equal(levelDb(Float32Array.from({ length: 8 }, (_, i) => (i % 2 ? 1 : -1))), 0);
  // a sine of amplitude 0.01: RMS 0.00707, about -43 dBFS
  assert.ok(Math.abs(levelDb(sine(0.01)) + 43.01) < 0.1);
  // never below the silence floor
  assert.equal(levelDb(sine(1e-9)), SILENCE_DB);
});

test('voice activity starts at once, holds through short pauses and then stops', () => {
  const { createVoiceActivity } = load();
  const va = createVoiceActivity(-45, -52, 450);
  assert.equal(va.update(-70, 0), false);
  assert.equal(va.update(-40, 60), true);
  // between the stop and the start level: still talking, and it counts as loud
  assert.equal(va.update(-50, 120), true);
  // quiet, but within the hold time after the last loud moment
  assert.equal(va.update(-80, 400), true);
  assert.equal(va.update(-80, 570), true);
  assert.equal(va.update(-80, 571), false);
  assert.equal(va.speaking, false);
  // a level between stop and start does not start talking on its own
  assert.equal(va.update(-50, 700), false);
});

test('reset ends talking at once', () => {
  const { createVoiceActivity } = load();
  const va = createVoiceActivity();
  assert.equal(va.update(-20, 0), true);
  va.reset();
  assert.equal(va.speaking, false);
  assert.equal(va.update(-100, 10), false);
});
