// The Diddy icon set may only replace icons folds knows, otherwise the swap does nothing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const src = fs.readFileSync(path.join(__dirname, '../src/app/plugins/diddyIcons.tsx'), 'utf8');
const body = src.slice(src.indexOf('export const DIDDY_ICONS'), src.indexOf('let applied'));
const names = [...body.matchAll(/^ {2}([A-Z][A-Za-z0-9]+):/gm)].map((m) => m[1]);
const foldsTypes = path.join(__dirname, '../node_modules/folds/dist/components/icon/Icons.d.ts');

test('the icon set covers the icons of the main screens', () => {
  for (const n of ['Cross', 'Search', 'Setting', 'User', 'Hash', 'Mic', 'Headphone', 'Send', 'Home']) {
    assert.ok(names.includes(n), `${n} missing`);
  }
  assert.equal(new Set(names).size, names.length, 'duplicate icon names');
});

test('every replaced icon exists in folds', { skip: !fs.existsSync(foldsTypes) }, () => {
  const known = new Set([...fs.readFileSync(foldsTypes, 'utf8').matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]));
  for (const n of names) assert.ok(known.has(n), `folds has no icon ${n}`);
});
