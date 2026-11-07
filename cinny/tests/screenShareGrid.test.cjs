// All screen shares at once instead of Element Call's one-at-a-time carousel (issue #66).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/screenShareGrid.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const exported = {};
vm.runInNewContext(output, { exports: exported, require: () => ({}) }, { filename });
const css = exported.SCREEN_SHARE_GRID_CSS;

const fakeWindow = () => {
  const appended = [];
  const doc = {
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => {
      const attrs = {};
      return { attrs, setAttribute: (k, v) => (attrs[k] = v), textContent: '' };
    },
    querySelector: (sel) => appended.find((el) => sel.includes(Object.keys(el.attrs)[0])) ?? null,
  };
  return { win: { document: doc }, appended };
};

test('the stylesheet is injected once, and a missing window is ignored', () => {
  const { win, appended } = fakeWindow();
  exported.installScreenShareGrid(win);
  exported.installScreenShareGrid(win);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].textContent, css);
  assert.doesNotThrow(() => exported.installScreenShareGrid(null));
  assert.doesNotThrow(() => exported.installScreenShareGrid(undefined));
});

test('the grid only applies to a carousel with two or more media tiles', () => {
  assert.match(
    css,
    /\[class\*="_contents_"\]:has\(> \[data-testid="videoTile"\]\[class\*="_item_"\] ~ /
  );
  assert.match(css, /display: grid !important/);
  // the arrows and indicator dashes go away, but only around such a carousel
  assert.match(css, /:has\(> \[class\*="_contents_"\] > .*\) > \[class\*="_advance_"\]/);
});

test('no :has() is nested in another :has() (browsers drop the whole rule)', () => {
  for (const selector of css.split('{').map((part) => part.split('}').pop())) {
    let depth = 0;
    let hasDepth = 0;
    for (let i = 0; i < selector.length; i += 1) {
      if (selector.startsWith(':has(', i)) {
        assert.equal(hasDepth, 0, `nested :has() in ${selector.trim()}`);
        hasDepth = depth + 1;
      }
      if (selector[i] === '(') depth += 1;
      if (selector[i] === ')') {
        if (depth === hasDepth) hasDepth = 0;
        depth -= 1;
      }
    }
  }
});

// Guards the selectors against an Element Call update: the bundled spotlight carousel must still
// be one CSS module with these class names, and the media tiles must keep their test id.
test('the bundled Element Call still has the spotlight carousel the selectors rely on', () => {
  const dist = path.join(
    __dirname,
    '../node_modules/@element-hq/element-call-embedded/dist/assets'
  );
  const files = fs.readdirSync(dist);
  const bundleCss = files
    .filter((f) => /^index-.*\.css$/.test(f))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  const contents =
    /\._contents_([a-z0-9]+)_\d+\{[^}]*scroll-snap-type:inline mandatory[^}]*display:flex/.exec(
      bundleCss
    );
  assert.ok(contents, 'spotlight carousel (_contents_) not found in the Element Call CSS');
  const hash = contents[1];
  assert.ok(new RegExp(`\\._item_${hash}_\\d+\\{[^}]*flex-basis:100%`).test(bundleCss));
  assert.ok(new RegExp(`\\._advance_${hash}_\\d+\\{`).test(bundleCss));
  assert.ok(new RegExp(`\\._indicators_${hash}_\\d+\\{`).test(bundleCss));
  assert.ok(new RegExp(`\\._tile_${hash}_\\d+`).test(bundleCss));
  const bundleJs = files
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  assert.ok(
    /"data-testid":[`"']videoTile[`"']/.test(bundleJs),
    'media tiles no longer carry data-testid="videoTile"'
  );
});
