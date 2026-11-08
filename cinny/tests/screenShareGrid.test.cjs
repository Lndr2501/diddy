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
  const listeners = [];
  const doc = {
    head: { appendChild: (el) => appended.push(el) },
    addEventListener: (type) => listeners.push(type),
    createElement: () => {
      const attrs = {};
      return { attrs, setAttribute: (k, v) => (attrs[k] = v), textContent: '' };
    },
    querySelector: (sel) => appended.find((el) => sel.includes(Object.keys(el.attrs)[0])) ?? null,
  };
  return { win: { document: doc }, appended, listeners };
};

test('the stylesheet is injected once, and a missing window is ignored', () => {
  const { win, appended, listeners } = fakeWindow();
  exported.installScreenShareGrid(win);
  exported.installScreenShareGrid(win);
  assert.equal(appended.length, 1);
  // the focus switching listeners are installed once too
  assert.deepEqual(listeners.sort(), ['click', 'keydown', 'pointerdown']);
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

// Issue #2, viewer side: click a share to focus it, click again (or Escape) for the grid.
const fakeEl = (kind, parent) => {
  const attrs = new Map();
  const el = {
    kind,
    parentElement: parent ?? null,
    children: [],
    matches: (sel) =>
      (kind === 'item' && sel.includes('_item_') && sel.includes('videoTile')) ||
      (kind === 'contents' && sel === '[class*="_contents_"]') ||
      (kind === 'control' && sel.includes('button')),
    closest: (sel) => {
      for (let cur = el; cur; cur = cur.parentElement) if (cur.matches(sel)) return cur;
      return null;
    },
    hasAttribute: (k) => attrs.has(k),
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  if (parent) parent.children.push(el);
  return el;
};

const carouselWith = (n) => {
  const contents = fakeEl('contents');
  const items = Array.from({ length: n }, () => fakeEl('item', contents));
  // a share's video inside its tile, and Element Call's volume button inside the first one
  const videos = items.map((item) => fakeEl('video', item));
  const control = fakeEl('control', items[0]);
  return { contents, items, videos, control };
};

const focusOf = (items) => items.map((i) => i.hasAttribute(exported.FOCUS_ATTR));

test('a click on a share focuses it, a second click returns to the grid', () => {
  const { toggleShareFocus } = exported;
  const { items, videos } = carouselWith(3);
  assert.equal(toggleShareFocus(videos[1]), true);
  assert.deepEqual(focusOf(items), [false, true, false]);
  // a thumbnail click switches to that share
  assert.equal(toggleShareFocus(videos[2]), true);
  assert.deepEqual(focusOf(items), [false, false, true]);
  assert.equal(toggleShareFocus(videos[2]), true);
  assert.deepEqual(focusOf(items), [false, false, false]);
});

test('clicks on controls, single shares and outside tiles are left to Element Call', () => {
  const { toggleShareFocus } = exported;
  const { items, control } = carouselWith(2);
  assert.equal(toggleShareFocus(control), false);
  assert.deepEqual(focusOf(items), [false, false]);
  assert.equal(toggleShareFocus(carouselWith(1).videos[0]), false);
  assert.equal(toggleShareFocus(fakeEl('video')), false);
  assert.equal(toggleShareFocus(null), false);
  // tiles outside the spotlight carousel (no _contents_ parent)
  const grid = fakeEl('grid');
  const stray = fakeEl('item', grid);
  fakeEl('item', grid);
  assert.equal(toggleShareFocus(stray), false);
});

test('Escape clears the focus', () => {
  const { FOCUS_ATTR, clearShareFocus } = exported;
  const focused = { removed: false };
  focused.removeAttribute = () => {
    focused.removed = true;
  };
  const doc = { querySelectorAll: (sel) => (sel === `[${FOCUS_ATTR}]` ? [focused] : []) };
  assert.equal(clearShareFocus(doc), true);
  assert.equal(focused.removed, true);
  assert.equal(clearShareFocus({ querySelectorAll: () => [] }), false);
});

test('the focused layout only applies while a share carries the focus attribute', () => {
  const { FOCUS_ATTR } = exported;
  assert.ok(css.includes(`:has(> [data-testid="videoTile"][class*="_item_"][${FOCUS_ATTR}])`));
  assert.match(css, /display: flex !important/);
  assert.match(css, /order: -1/);
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
