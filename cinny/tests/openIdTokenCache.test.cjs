const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/openIdTokenCache.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, Date, Promise });
const { createOpenIdTokenCache } = mod;

test('a call token is reused until a minute before it expires', async () => {
  let t = 0;
  let fetched = 0;
  const cache = createOpenIdTokenCache(async () => {
    fetched += 1;
    return { access_token: `t${fetched}`, expires_in: 3600 };
  }, () => t);
  assert.equal((await cache.get()).access_token, 't1');
  t = 3600 * 1000 - 61 * 1000;
  assert.equal((await cache.get()).access_token, 't1');
  t = 3600 * 1000 - 60 * 1000;
  assert.equal((await cache.get()).access_token, 't2');
  assert.equal(fetched, 2);
});

test('a failed request is not kept', async () => {
  let fail = true;
  const cache = createOpenIdTokenCache(async () => {
    if (fail) throw new Error('offline');
    return { access_token: 'ok', expires_in: 3600 };
  });
  await assert.rejects(cache.get());
  await new Promise((r) => setTimeout(r, 0));
  fail = false;
  assert.equal((await cache.get()).access_token, 'ok');
});
