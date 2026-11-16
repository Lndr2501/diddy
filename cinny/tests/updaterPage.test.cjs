// #243: the macOS update window loads /updater.html from the built frontend. vite.config.js has
// `publicDir: false`, so the page only lands in dist/ if it is copied explicitly. Without it the
// local server answers with index.html and the whole app opens in the small update window.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('the update page exists and is copied into the build', () => {
  assert.ok(fs.existsSync(path.join(root, 'public/updater.html')));
  const config = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');
  if (/publicDir:\s*false/.test(config)) {
    assert.match(config, /src:\s*'public\/updater\.html',\s*\n\s*dest:\s*''/);
  }
});

test('the Tauri updater still points at /updater.html', { skip: !fs.existsSync(path.join(root, '../src-tauri/src/updater.rs')) }, () => {
  const rust = fs.readFileSync(path.join(root, '../src-tauri/src/updater.rs'), 'utf8');
  assert.match(rust, /\/updater\.html/);
});
