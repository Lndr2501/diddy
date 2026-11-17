// #260 (and #118): a tile's volume menu in the call went under the neighbouring tile's name tag
// on macOS. The name tags' backdrop-filter gave them their own WebKit layer that ignored the
// menu's z-index; while a menu is open the tags lose the blur, and the menu gets its own layer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/callTheme.ts'), 'utf8');
const css = source.slice(source.indexOf('const CALL_THEME_CSS'));
// the tile selector as it stands in the template literal
const TILE = ['$', '{TILE}'].join('');

const rule = (selector) => {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `rule for ${selector}`);
  const open = start + selector.length + 1;
  return css.slice(open, css.indexOf('}', open));
};

test('the menu wrapper sits above every tile in its own layer', () => {
  const body = rule('html body [data-radix-popper-content-wrapper]');
  assert.match(body, /z-index:\s*2147483000 !important/);
  assert.match(body, /will-change:\s*transform/);
});

test('while a menu is open the name tags have no backdrop-filter layer', () => {
  const body = rule(`html body:has([data-radix-popper-content-wrapper]) ${TILE} [class*="_nameTag_"]`);
  assert.match(body, /-webkit-backdrop-filter:\s*none !important/);
  assert.match(body, /(^|[^-])backdrop-filter:\s*none !important/m);
});

test('without an open menu the name tags keep their frosted look', () => {
  assert.match(rule(`${TILE} [class*="_nameTag_"]`), /backdrop-filter:\s*blur\(/);
});
