// Thread view logic: merging replies and the content of a reply sent from it (#188).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/threadEvents.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });

const evt = (id, ts, threadRootId) => ({ id, ts, threadRootId });

test('replies from several lists are merged, deduplicated and sorted by time', () => {
  const timeline = [evt('$c', 30, '$root'), evt('$x', 5), evt('$b', 20, '$root')];
  const server = [evt('$a', 10, '$root'), evt('$b', 20, '$root')];
  const merged = mod.mergeThreadReplies('$root', timeline, server);
  assert.deepEqual(
    Array.from(merged, (e) => e.id),
    ['$a', '$b', '$c']
  );
});

test('other threads, the root itself and events without an ID are left out', () => {
  const merged = mod.mergeThreadReplies('$root', [
    evt('$root', 1, '$root'),
    evt('$other', 2, '$elsewhere'),
    { ts: 3, threadRootId: '$root' },
    evt('$ok', 4, '$root'),
  ]);
  assert.deepEqual(
    Array.from(merged, (e) => e.id),
    ['$ok']
  );
});

test('a reply from the thread view relates to the root and falls back to the last message', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(mod.buildThreadReply('$root', '$last', '  hi  '))), {
    msgtype: 'm.text',
    body: 'hi',
    'm.relates_to': {
      rel_type: 'm.thread',
      event_id: '$root',
      is_falling_back: true,
      'm.in_reply_to': { event_id: '$last' },
    },
  });
  assert.equal(
    mod.buildThreadReply('$root', undefined, 'x')['m.relates_to']['m.in_reply_to'].event_id,
    '$root'
  );
});

test('an empty reply is not sent', () => {
  assert.equal(mod.buildThreadReply('$root', '$last', '   \n '), undefined);
});
