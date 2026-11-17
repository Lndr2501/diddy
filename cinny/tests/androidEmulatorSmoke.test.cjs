/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const script = path.join(__dirname, '../../.github/scripts/android-emulator-smoke.sh');
const fakeAdb = `#!/usr/bin/env bash
case "$*" in
  'shell getconf PAGE_SIZE')
    if [ "$LEGACY_PAGE_SIZE" = 1 ]; then exit 127; fi
    echo 16384 ;;
  'shell cat /proc/self/smaps') printf 'Header\\nKernelPageSize:        4 kB\\nOther mapping\\nKernelPageSize:        4 kB\\n' ;;
  'shell getprop ro.build.fingerprint') echo synthetic-emulator ;;
  'install -r '*|'logcat -d '*|'shell run-as '*) ;;
  'logcat -c') if [ "$LEGACY_PAGE_SIZE" = 1 ]; then echo "failed to clear the 'main' log" >&2; exit 1; fi ;;
  'shell am instrument '*)
    if [ "$FAIL_INSTRUMENTATION" = 1 ]; then echo 'FAILURES!!!'; else echo 'OK (3 tests)'; fi ;;
  *) echo 'Unexpected adb call' >&2; exit 2 ;;
esac
`;

function run(legacy, fail) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-android-smoke-'));
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin/adb'), fakeAdb, { mode: 0o755 });
    fs.mkdirSync(path.join(dir, 'emulator-apks'));
    fs.writeFileSync(path.join(dir, 'emulator-apks/app-debug.apk'), 'synthetic');
    fs.writeFileSync(path.join(dir, 'emulator-apks/app-debug-androidTest.apk'), 'synthetic');
    const result = spawnSync('bash', [script], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, LEGACY_PAGE_SIZE: String(legacy), FAIL_INSTRUMENTATION: String(fail) },
    });
    return { ...result, pageSize: fs.readFileSync(path.join(dir, 'emulator-report/page-size.txt'), 'utf8').trim() };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('API 26 without getconf or logcat clearing still reaches all instrumentation tests', { skip: !fs.existsSync(script) }, () => {
  const result = run(1, 0);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.pageSize, '4096');
  assert.match(result.stdout, /OK \(3 tests\)/);
});

test('modern emulators report their actual getconf page size', { skip: !fs.existsSync(script) }, () => {
  const result = run(0, 0);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.pageSize, '16384');
});

test('an instrumentation failure fails the job even when adb exits zero', { skip: !fs.existsSync(script) }, () => {
  const result = run(1, 1);
  assert.notEqual(result.status, 0);
});
