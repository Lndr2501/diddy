// A memoized timeline row is drawn again exactly when one of its inputs changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const mod = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/features/room/TimelineRowMemo.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText,
  { exports: mod, require: (id) => (id === 'react' ? { memo: (c, eq) => ({ c, eq }) } : {}) }
);

test('same inputs keep the row, any changed input draws it again', () => {
  const ctx = {};
  const ev = {};
  assert.equal(mod.sameDeps([ctx, ev, 'a', true, undefined], [ctx, ev, 'a', true, undefined]), true);
  assert.equal(mod.sameDeps([ctx, ev, 'a'], [{}, ev, 'a']), false, 'new context object');
  assert.equal(mod.sameDeps([ctx, ev, 'a'], [ctx, ev, 'b']), false);
  assert.equal(mod.sameDeps([ctx, ev], [ctx, ev, 'extra']), false);
  assert.equal(mod.sameDeps([NaN], [NaN]), true, 'Object.is');
});

test('the memo compares only the inputs, not the freshly created element', () => {
  const { eq } = mod.TimelineRowMemo;
  assert.equal(eq({ deps: [1, 2], children: {} }, { deps: [1, 2], children: {} }), true);
  assert.equal(eq({ deps: [1, 2], children: {} }, { deps: [1, 3], children: {} }), false);
});
