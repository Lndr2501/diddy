// #174: async callbacks bound to buttons must not leave unhandled rejections behind.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/app/hooks/useAsyncCallback.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = {};
vm.runInNewContext(code, { exports: mod, require: () => ({}) });

test('a rejected callback does not become an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  const seen = [];
  const handler = mod.ignoreRejection(async (...args) => {
    seen.push(args);
    throw new Error('M_FORBIDDEN');
  });
  assert.equal(handler('click-event'), undefined);
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(seen, [['click-event']]);
  assert.deepEqual(unhandled, []);
});

test('the source has no async callback bound directly to a handler', () => {
  const root = path.join(__dirname, '../src');
  const offenders = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith('.tsx')) return undefined;
      const text = fs.readFileSync(full, 'utf8');
      const names = Array.from(text.matchAll(/const \[\w+,\s*(\w+)\]\s*=\s*useAsyncCallback/g)).map((m) => m[1]);
      names.forEach((name) => {
        if (new RegExp(`on(Click|Change)=\\{${name}\\}`).test(text)) offenders.push(`${path.relative(root, full)}: ${name}`);
      });
      return undefined;
    });
  walk(root);
  assert.deepEqual(offenders, [], 'wrap these in ignoreRejection(...)');
});
