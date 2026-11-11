/* eslint-disable @typescript-eslint/no-var-requires -- Node's test runner loads CommonJS files. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const script = path.resolve(__dirname, '../../electron/tests/native_audio_test.py');
// The Nix build only copies cinny/ (nix/package.nix frontendSrc), so the Electron tests are not there.
const skip = !fs.existsSync(script) && 'electron/tests not in this source tree';

test('native audio readiness and PCM waits remain bounded without audio hardware', { skip }, () => {
  const result = spawnSync('python3', [script], {
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
});
