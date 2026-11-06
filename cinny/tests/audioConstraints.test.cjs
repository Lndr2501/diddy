// Run on the Mac from cinny/: node --test tests/audioConstraints.test.cjs
// Transpiles only the dependency-neutral helper; this is not a project typecheck or build.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInThisContext } = require('node:vm');
const ts = require('typescript');

const helperPath = path.join(__dirname, '../src/app/plugins/call/audioConstraints.ts');
const { outputText } = ts.transpileModule(readFileSync(helperPath, 'utf8'), {
  fileName: helperPath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
});
const helperExports = {};
runInThisContext(`(function (exports) {\n${outputText}\n})`, { filename: helperPath })(
  helperExports
);
const { applyAudioProcessingPolicy } = helperExports;

const processingOff = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  voiceIsolation: false,
};

test('OFF overrides incoming processing flags, including voiceIsolation', () => {
  for (const requested of [true, { exact: true }, { ideal: true }]) {
    assert.deepEqual(
      applyAudioProcessingPolicy(
        {
          echoCancellation: requested,
          noiseSuppression: requested,
          autoGainControl: requested,
          voiceIsolation: requested,
        },
        false
      ),
      processingOff
    );
  }
});

test('OFF preserves unrelated constraints without mutating the request', () => {
  const deviceId = Object.freeze({ exact: 'preferred-microphone' });
  const sampleRate = Object.freeze({ ideal: 44100 });
  const advanced = Object.freeze([Object.freeze({ channelCount: 1 })]);
  const request = Object.freeze({
    deviceId,
    sampleRate,
    channelCount: 2,
    latency: 0.01,
    advanced,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: true,
  });
  const result = applyAudioProcessingPolicy(request, false);

  assert.notStrictEqual(result, request);
  assert.deepEqual(result, { ...request, ...processingOff });
  assert.strictEqual(result.deviceId, deviceId);
  assert.strictEqual(result.sampleRate, sampleRate);
  assert.strictEqual(result.advanced, advanced);
  assert.equal(request.voiceIsolation, true);
});

test('OFF expands an audio:true permission probe into explicit processing flags', () => {
  assert.deepEqual(applyAudioProcessingPolicy(true, false), processingOff);
});

test('ON passes the original constraints through unchanged', () => {
  const request = Object.freeze({
    echoCancellation: Object.freeze({ ideal: true }),
    noiseSuppression: false,
    autoGainControl: true,
    voiceIsolation: true,
    deviceId: Object.freeze({ exact: 'preferred-microphone' }),
    sampleRate: 44100,
  });
  assert.strictEqual(applyAudioProcessingPolicy(request, true), request);
});

test('ON preserves audio:true rather than forcing any processing flags', () => {
  assert.strictEqual(applyAudioProcessingPolicy(true, true), true);
});
