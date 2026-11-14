const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/diddy/backfillDelta.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, Map, Array });
const { takeUntil, mergeStored } = mod;
const ev = (id, ts) => ({ event_id: id, type: 'app.diddy.profile', sender: '@a:x', origin_server_ts: ts, content: {} });

test('only events newer than the last read are taken', () => {
  const chunk = [ev('$5', 5), ev('$4', 4), ev('$3', 3), ev('$2', 2)];
  assert.deepEqual(takeUntil(chunk, '$3').events.map((e) => e.event_id), ['$5', '$4']);
  assert.equal(takeUntil(chunk, '$3').reached, true);
  assert.equal(takeUntil(chunk, '$9').reached, false, 'older than this page: keep paging');
  assert.equal(takeUntil(chunk, undefined).events.length, 4, 'nothing stored: everything');
});

test('stored history keeps each event once, newest first, capped', () => {
  const merged = mergeStored([ev('$1', 1), ev('$2', 2)], [ev('$3', 3), ev('$2', 2)], 2);
  assert.deepEqual(merged.map((e) => e.event_id), ['$3', '$2']);
});

test('stored events move deeper by the number of newer events', () => {
  const old = [{ ...ev('$1', 1), depth: 10 }];
  const merged = mergeStored(old, [{ ...ev('$2', 2), depth: 0 }], 10, 5);
  assert.equal(merged.find((e) => e.event_id === '$1').depth, 15);
  assert.equal(merged.find((e) => e.event_id === '$2').depth, 0);
});
