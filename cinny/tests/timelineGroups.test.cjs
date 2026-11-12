// Folding runs of room updates (joins, invites, name changes) into one summary row.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/timelineGroups.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod }, { filename });
const plain = (x) => JSON.parse(JSON.stringify(x));
const days = (n, d = 'd1') => Array.from({ length: n }, () => d);

test('three or more updates in a row form a run, fewer stay as they are', () => {
  const kinds = ['update', 'update', 'message', 'update', 'update', 'update', 'message'];
  assert.deepEqual(plain(mod.findUpdateRuns(kinds, days(kinds.length))), [{ start: 3, end: 5 }]);
  assert.deepEqual(plain(mod.findUpdateRuns(['update', 'update'], days(2))), []);
});

test('hidden items do not break a run, a new day does', () => {
  const kinds = ['update', 'hidden', 'update', 'update', 'update', 'update', 'update'];
  const dayKeys = ['a', 'a', 'a', 'a', 'b', 'b', 'b'];
  assert.deepEqual(plain(mod.findUpdateRuns(kinds, dayKeys)), [
    { start: 0, end: 3 },
    { start: 4, end: 6 },
  ]);
});

test('a run at the very end of the timeline is closed', () => {
  const kinds = ['message', 'update', 'update', 'update'];
  assert.deepEqual(plain(mod.findUpdateRuns(kinds, days(4))), [{ start: 1, end: 3 }]);
});

test('the summary counts joins, invites, leaves and other changes', () => {
  const summary = mod.summarizeUpdates([
    { membership: 'join', prevMembership: 'invite' },
    { membership: 'join' },
    { membership: 'invite' },
    { membership: 'leave', prevMembership: 'join' },
    {},
    { membership: 'join', prevMembership: 'join' },
  ]);
  assert.equal(summary, '2 joined · 1 invited · 1 left · 2 changes');
  assert.equal(mod.summarizeUpdates([{}]), '1 change');
});
