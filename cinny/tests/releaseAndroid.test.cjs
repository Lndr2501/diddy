/* eslint-disable @typescript-eslint/no-var-requires -- Node's test runner loads this CommonJS file. */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const workflow = path.join(root, '.github/workflows/release.yml');
const skip = !fs.existsSync(workflow) && 'release workflow not in this source tree';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-release-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(dir, file, content) {
  const target = path.join(dir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function stepScript(name) {
  const source = fs.readFileSync(workflow, 'utf8');
  const step = source.split(`      - name: ${name}\n`)[1];
  assert.ok(step, `missing workflow step ${name}`);
  const block = step.match(/ {8}run: \|\n((?: {10}.*\n|\n)*)/)[1];
  return block.replace(/^ {10}/gm, '');
}

function run(script, cwd, env) {
  return spawnSync('bash', ['-e', '-c', script], {
    cwd, env: { ...process.env, ...env }, encoding: 'utf8',
  });
}

test('tag stamping updates desktop and Android together; branch builds keep their versions', { skip }, (t) => {
  const dir = fixture(t);
  const desktop = 'cinny/src/app/appInfo.ts';
  const android = 'android/app/build.gradle.kts';
  write(dir, desktop, "export const APP_VERSION = '1.0.0';\n");
  write(dir, android, 'val diddyVersion = "1.0.0"\n');
  const script = fs.readFileSync(path.join(root, '.github/scripts/stamp-version.sh'), 'utf8');
  assert.equal(run(script, dir, { GITHUB_REF: 'refs/heads/main' }).status, 0);
  assert.match(fs.readFileSync(path.join(dir, android), 'utf8'), /"1\.0\.0"/);
  assert.match(fs.readFileSync(path.join(dir, desktop), 'utf8'), /'1\.0\.0'/);
  const stamped = run(script, dir, { GITHUB_REF: 'refs/tags/v1.11.1' });
  assert.equal(stamped.status, 0, stamped.stdout + stamped.stderr);
  assert.match(fs.readFileSync(path.join(dir, desktop), 'utf8'), /'1\.11\.1'/);
  assert.match(fs.readFileSync(path.join(dir, android), 'utf8'), /"1\.11\.1"/);
  assert.equal(fs.existsSync(path.join(dir, `${android}.bak`)), false);
});

test('the release version check rejects an Android version that differs from the tag', { skip }, (t) => {
  const dir = fixture(t);
  const files = ['package.json', 'electron/package.json', 'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml', 'ios/project.yml', 'cinny/src/app/appInfo.ts',
    'android/app/build.gradle.kts', 'CHANGELOG.md'];
  files.forEach((file) => write(dir, file, fs.readFileSync(path.join(root, file))));
  const { version } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  const env = { REF: `refs/tags/v${version}`, GITHUB_OUTPUT: path.join(dir, 'output') };
  const script = stepScript('Check that the tag matches the versions and the changelog');
  const matching = run(script, dir, env);
  assert.equal(matching.status, 0, matching.stdout + matching.stderr);
  write(dir, 'android/app/build.gradle.kts', 'val diddyVersion = "0.0.0"\n');
  const mismatch = run(script, dir, env);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stdout, /android\/app\/build\.gradle\.kts has version '0\.0\.0'/);
});

test('publication requires the release APK even when a debug APK is available', { skip }, (t) => {
  const dir = fixture(t);
  const version = '1.11.1';
  const packages = ['aarch64.dmg', 'x86_64.AppImage', 'x86_64.AppImage.zsync',
    'amd64.deb', 'x86_64.rpm', 'x64-setup.exe', 'Android.apk'];
  packages.forEach((suffix) => write(dir, `dist/Diddy_${version}_${suffix}`, 'package'));
  const script = stepScript('Check the packages');
  assert.equal(run(script, dir, { VERSION: version }).status, 0);
  fs.renameSync(path.join(dir, `dist/Diddy_${version}_Android.apk`),
    path.join(dir, `dist/Diddy_${version}_Android_debug.apk`));
  const missing = run(script, dir, { VERSION: version });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /Android\.apk is missing/);
});
