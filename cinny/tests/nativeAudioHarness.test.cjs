/* eslint-disable @typescript-eslint/no-var-requires -- Node's test runner loads CommonJS files. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('native audio readiness and PCM waits remain bounded without audio hardware', () => {
  const result = spawnSync('python3', [path.resolve(__dirname, '../../electron/tests/native_audio_test.py')], {
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});
