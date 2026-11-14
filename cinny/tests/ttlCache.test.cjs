const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/ttlCache.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, Date, Map, Array });
const { createTtlCache } = mod;

test('entries expire after the ttl and can be dropped by space', () => {
  let t = 0;
  const cache = createTtlCache(1000, () => t);
  cache.set('!a|', 'page a');
  cache.set('!a|next', 'page a2');
  cache.set('!b|', 'page b');
  t = 999;
  assert.equal(cache.get('!a|'), 'page a');
  cache.deletePrefix('!a|');
  assert.equal(cache.get('!a|'), undefined);
  assert.equal(cache.get('!a|next'), undefined);
  assert.equal(cache.get('!b|'), 'page b');
  t = 1000;
  assert.equal(cache.get('!b|'), undefined, 'expired');
  assert.equal(cache.size(), 0);
});
