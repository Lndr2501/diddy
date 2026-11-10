// Contract test: every Tauri command (macOS) the page can call must exist in the Electron shell
// (Linux), otherwise the page gets "unknown command" and the feature silently does nothing.
// Reads the sources as text, no Electron needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const libRs = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
const mainCjs = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

// Only the macOS updater window (cinny/public/updater.html) calls these; Linux has no native updater.
const MACOS_ONLY = new Set(['updater_state', 'updater_action', 'updater_open_release_page']);

const tauriCommands = () => {
  const block = /generate_handler!\[([\s\S]*?)\]/.exec(libRs);
  assert.ok(block, 'generate_handler![...] not found in src-tauri/src/lib.rs');
  return block[1]
    .split(',')
    .map((entry) => entry.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean)
    .map((entry) => entry.split('::').pop());
};

const electronCommands = () => {
  const block = /const commands = \{\n([\s\S]*?)\n\};/.exec(mainCjs);
  assert.ok(block, '`const commands = {...}` not found in electron/main.cjs');
  return [...block[1].matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]);
};

test('the parsers find the command lists', () => {
  assert.ok(tauriCommands().length >= 10);
  assert.ok(electronCommands().includes('diag_log'));
});

test('every Tauri command exists in the Electron shell, except the macOS-only updater ones', () => {
  const linux = new Set(electronCommands());
  const missing = tauriCommands().filter((name) => !linux.has(name) && !MACOS_ONLY.has(name));
  assert.deepEqual(missing, [], `missing in electron/main.cjs commands: ${missing.join(', ')}`);
});

test('the macOS-only allow-list only names real Tauri commands, and Linux does not fake them', () => {
  const tauri = new Set(tauriCommands());
  const linux = new Set(electronCommands());
  for (const name of MACOS_ONLY) {
    assert.ok(tauri.has(name), `${name} is not a Tauri command any more, drop it from the allow-list`);
    assert.ok(!linux.has(name), `${name} exists on Linux, drop it from the allow-list`);
  }
});

test('Electron does not offer commands that Tauri lacks', () => {
  const tauri = new Set(tauriCommands());
  const extra = electronCommands().filter((name) => !tauri.has(name));
  assert.deepEqual(extra, []);
});
