// #178, #179: every Tauri command the page can call needs an ACL entry, and the plugins the page
// calls must be initialised. Reads the sources as text, no Rust toolchain needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const tauriDir = path.join(__dirname, '..', '..', 'src-tauri');
const read = (file) => {
  const full = path.join(tauriDir, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined;
};
const libRs = read('src/lib.rs');
const buildRs = read('build.rs');
const appCommands = read('capabilities/app-commands.json');
// The Nix build of the frontend does not copy the Rust sources.
const skip = !(libRs && buildRs && appCommands) && 'src-tauri sources not in this tree';

const handlerCommands = () =>
  /generate_handler!\[([\s\S]*?)\]/
    .exec(libRs)[1]
    .split(',')
    .map((entry) => entry.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean)
    .map((entry) => entry.split('::').pop());

test('every registered command is declared in build.rs', { skip }, () => {
  const declared = new Set([...buildRs.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
  const missing = handlerCommands().filter((name) => !declared.has(name));
  assert.deepEqual(missing, [], `missing in build.rs app manifest: ${missing.join(', ')}`);
});

test('every registered command is allowed in capabilities/app-commands.json', { skip }, () => {
  const allowed = new Set(JSON.parse(appCommands).permissions);
  const missing = handlerCommands().filter((name) => !allowed.has(`allow-${name.replace(/_/g, '-')}`));
  assert.deepEqual(missing, [], `missing permissions: ${missing.join(', ')}`);
});

test('the plugins the page calls are initialised', { skip }, () => {
  const src = path.join(__dirname, '..', 'src');
  const used = new Set();
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        Array.from(text.matchAll(/'plugin:([a-z-]+)\|/g)).forEach((m) => used.add(m[1]));
      }
    });
  walk(src);
  assert.ok(used.has('fs') && used.has('dialog'), 'parser should find the fs and dialog calls');
  used.forEach((plugin) => {
    const crate = `tauri_plugin_${plugin.replace(/-/g, '_')}`;
    assert.match(libRs, new RegExp(`\\.plugin\\(\\s*${crate}::`), `${crate} is not initialised in lib.rs`);
  });
});
