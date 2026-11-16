// Builds the Windows system-audio helper (Rust, native/windows-audio) into native/bin/diddy-system-audio.exe.
// Runs cargo inside the crate folder so its .cargo/config.toml (static C runtime) applies.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const crate = path.join(__dirname, 'windows-audio');
const target = process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR) : path.join(crate, 'target');
const built = spawnSync('cargo', ['build', '--release', '--locked'], { cwd: crate, stdio: 'inherit', shell: process.platform === 'win32' });
if (built.status !== 0) process.exit(built.status ?? 1);
const binary = path.join(target, 'release', 'diddy-system-audio.exe');
if (!fs.existsSync(binary)) {
  console.error(`missing ${binary} (this helper is built on Windows)`);
  process.exit(1);
}
fs.mkdirSync(path.join(__dirname, 'bin'), { recursive: true });
fs.copyFileSync(binary, path.join(__dirname, 'bin', 'diddy-system-audio.exe'));
console.log('built native/bin/diddy-system-audio.exe');
