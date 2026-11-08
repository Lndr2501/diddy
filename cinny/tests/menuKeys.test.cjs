// Issue #21: the status menu moves like a native macOS menu.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/utils/menuKeys.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 } }
).outputText;
const mod = {};
vm.runInNewContext(code, { exports: mod });
const { nextMenuIndex } = mod;

test('arrow keys move and wrap around', () => {
  assert.equal(nextMenuIndex(0, 'ArrowDown', 4), 1);
  assert.equal(nextMenuIndex(3, 'ArrowDown', 4), 0);
  assert.equal(nextMenuIndex(0, 'ArrowUp', 4), 3);
  assert.equal(nextMenuIndex(2, 'ArrowUp', 4), 1);
});

test('Home and End jump to the ends', () => {
  assert.equal(nextMenuIndex(2, 'Home', 4), 0);
  assert.equal(nextMenuIndex(1, 'End', 4), 3);
});

test('without a focused item the first arrow press enters the menu at its edge', () => {
  assert.equal(nextMenuIndex(-1, 'ArrowDown', 4), 0);
  assert.equal(nextMenuIndex(-1, 'ArrowUp', 4), 3);
  assert.equal(nextMenuIndex(9, 'ArrowDown', 4), 0);
});

test('other keys and empty menus do not move the focus', () => {
  assert.equal(nextMenuIndex(1, 'Enter', 4), undefined);
  assert.equal(nextMenuIndex(1, 'a', 4), undefined);
  assert.equal(nextMenuIndex(0, 'ArrowDown', 0), undefined);
});
