// Sent pictures get a preview of at most 800 px, still pictures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/utils/imageThumbnail.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });

test('large still pictures get a preview with the longest side at 800 px', () => {
  assert.deepEqual([...mod.imageThumbnailSize(4000, 3000, 'image/jpeg')], [800, 600]);
  assert.deepEqual([...mod.imageThumbnailSize(1000, 4000, 'image/png')], [200, 800]);
  assert.deepEqual([...mod.imageThumbnailSize(801, 1, 'image/jpeg')], [800, 1]);
});

test('small, animated and unreadable pictures get none', () => {
  assert.equal(mod.imageThumbnailSize(800, 600, 'image/jpeg'), undefined);
  assert.equal(mod.imageThumbnailSize(4000, 3000, 'image/gif'), undefined);
  assert.equal(mod.imageThumbnailSize(4000, 3000, 'IMAGE/WEBP'), undefined);
  assert.equal(mod.imageThumbnailSize(0, 0, 'image/jpeg'), undefined);
  assert.equal(mod.imageThumbnailSize(NaN, 100, 'image/jpeg'), undefined);
});
