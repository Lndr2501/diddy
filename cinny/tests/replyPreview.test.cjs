// Reply quotes show mentions by name, not as raw Markdown links (#184).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/replyPreview.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });

test('a Markdown mention link shows only its name (#184)', () => {
  assert.equal(
    mod.replyPreviewText('[Lndr](https://matrix.to/#/@lndr:matrix.tllx.eu) gib mir mehr issues'),
    'Lndr gib mir mehr issues'
  );
  assert.equal(
    mod.replyPreviewText('hi [Luis](https://matrix.to/#/@luis:example.org) and [Ana](https://matrix.to/#/@ana:example.org)'),
    'hi Luis and Ana'
  );
});

test('room and event links keep their label too', () => {
  assert.equal(mod.replyPreviewText('see [#general](https://matrix.to/#/%23general:example.org)'), 'see #general');
  assert.equal(
    mod.replyPreviewText('[this](https://matrix.to/#/!room:example.org/$event?via=example.org)'),
    'this'
  );
});

test('other links and plain text stay untouched', () => {
  assert.equal(mod.replyPreviewText('[docs](https://example.org/x)'), '[docs](https://example.org/x)');
  assert.equal(mod.replyPreviewText('@lndr:matrix.tllx.eu hi'), '@lndr:matrix.tllx.eu hi');
  assert.equal(mod.replyPreviewText('[broken](https://matrix.to/#/@a b)'), '[broken](https://matrix.to/#/@a b)');
});

test('the reply fallback is still removed', () => {
  const body = '> <@a:example.org> old message\n> more\n\n[Lndr](https://matrix.to/#/@lndr:example.org) new';
  assert.equal(mod.replyPreviewText(body), 'Lndr new');
});
