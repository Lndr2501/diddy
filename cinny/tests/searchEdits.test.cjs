// Issue #109: message search shows only the current version of an edited message.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/app/features/message-search/searchEdits.ts'),
    'utf8'
  );
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(out, { exports });
  return exports;
}

const raw = load();
// results come from another vm realm; copy them so deepEqual compares plain values
const S = Object.fromEntries(
  Object.entries(raw).map(([k, fn]) => [k, (...args) => JSON.parse(JSON.stringify(fn(...args)))])
);
const ROOM = '!room:x';
const ALICE = '@alice:x';
const BOB = '@bob:x';

const msg = (id, body, extra = {}) => ({
  event_id: id,
  room_id: ROOM,
  sender: ALICE,
  type: 'm.room.message',
  origin_server_ts: 1000,
  content: { msgtype: 'm.text', body },
  ...extra,
});
const edit = (id, target, body, extra = {}) => ({
  event_id: id,
  room_id: ROOM,
  sender: ALICE,
  type: 'm.room.message',
  origin_server_ts: 2000,
  content: {
    msgtype: 'm.text',
    body: `* ${body}`,
    'm.new_content': { msgtype: 'm.text', body },
    'm.relates_to': { rel_type: 'm.replace', event_id: target },
  },
  ...extra,
});
const hit = (event, rank = 1) => ({ rank, event, context: {} });
const summary = (resolved) =>
  resolved.map((r) => [r.originalEventId, r.event.event_id, r.event.content.body, r.edited]);

test('no edit: hit is shown unchanged', () => {
  const r = S.resolveSearchHits([hit(msg('$a', 'hello world'))], [], 'hello');
  assert.deepEqual(summary(r), [['$a', '$a', 'hello world', false]]);
});

test('one edit, both hit: one result with the new text, original id, edited marker', () => {
  const r = S.resolveSearchHits(
    [hit(edit('$e1', '$a', 'hello there')), hit(msg('$a', 'hello world'))],
    [],
    'hello'
  );
  assert.deepEqual(summary(r), [['$a', '$a', 'hello there', true]]);
  assert.equal(r[0].event.content['m.new_content'], undefined);
});

test('two edits: the latest wins, once', () => {
  const hits = [
    hit(edit('$e1', '$a', 'hello one', { origin_server_ts: 2000 })),
    hit(edit('$e2', '$a', 'hello two', { origin_server_ts: 3000 })),
    hit(msg('$a', 'hello zero')),
  ];
  assert.deepEqual(summary(S.resolveSearchHits(hits, [], 'hello')), [
    ['$a', '$a', 'hello two', true],
  ]);
});

test('older edit matched but latest edit no longer contains the term: hidden', () => {
  const hits = [hit(edit('$e1', '$a', 'hello one', { origin_server_ts: 2000 }))];
  const extra = [
    msg('$a', 'hello zero'),
    edit('$e2', '$a', 'goodbye', { origin_server_ts: 3000 }),
  ];
  assert.deepEqual(S.resolveSearchHits(hits, extra, 'hello'), []);
});

test('edit hit without original: original is fetched and shown with the new text', () => {
  const hits = [hit(edit('$e1', '$a', 'hello new'))];
  assert.deepEqual((S.missingOriginals(hits)), [{ roomId: ROOM, eventId: '$a' }]);
  const r = S.resolveSearchHits(hits, [msg('$a', 'old text')], 'hello');
  assert.deepEqual(summary(r), [['$a', '$a', 'hello new', true]]);
});

test('edit hit whose original cannot be loaded is dropped', () => {
  assert.deepEqual(S.resolveSearchHits([hit(edit('$e1', '$a', 'hello'))], [], 'hello'), []);
});

test('original hit without edit hit, current text still matches: shown with new text', () => {
  const original = msg('$a', 'hello old', {
    unsigned: { 'm.relations': { 'm.replace': { event_id: '$e1', sender: ALICE, origin_server_ts: 2000 } } },
  });
  assert.deepEqual((S.missingBundledEdits([original], [])), [{ roomId: ROOM, eventId: '$e1' }]);
  const r = S.resolveSearchHits([hit(original)], [edit('$e1', '$a', 'hello new')], 'hello');
  assert.deepEqual(summary(r), [['$a', '$a', 'hello new', true]]);
});

test('original matched only the old text: hidden, no stale text', () => {
  const original = msg('$a', 'secret plan', {
    unsigned: { 'm.relations': { 'm.replace': { event_id: '$e1', sender: ALICE, origin_server_ts: 2000 } } },
  });
  assert.deepEqual(S.resolveSearchHits([hit(original)], [edit('$e1', '$a', 'nothing here')], 'secret'), []);
});

test('original edited but edit content could not be loaded: hidden', () => {
  const original = msg('$a', 'secret plan', {
    unsigned: { 'm.relations': { 'm.replace': { event_id: '$e1', sender: ALICE, origin_server_ts: 2000 } } },
  });
  assert.deepEqual(S.resolveSearchHits([hit(original)], [], 'secret'), []);
});

test('bundled edit with full content (older servers) is used directly', () => {
  const original = msg('$a', 'secret plan', {
    unsigned: { 'm.relations': { 'm.replace': edit('$e1', '$a', 'secret party') } },
  });
  assert.deepEqual(S.missingBundledEdits([original], []), []);
  assert.deepEqual(summary(S.resolveSearchHits([hit(original)], [], 'secret')), [
    ['$a', '$a', 'secret party', true],
  ]);
});

test('edit from another sender is ignored', () => {
  const hits = [
    hit(edit('$e1', '$a', 'hello hijacked', { sender: BOB, origin_server_ts: 5000 })),
    hit(msg('$a', 'hello world')),
  ];
  assert.deepEqual(summary(S.resolveSearchHits(hits, [], 'hello')), [
    ['$a', '$a', 'hello world', false],
  ]);
  // a foreign edit alone does not resurrect the original
  assert.deepEqual(
    S.resolveSearchHits([hits[0]], [msg('$a', 'other text')], 'hello'),
    []
  );
});

test('bundled reference from another sender is not trusted', () => {
  const original = msg('$a', 'hello world', {
    unsigned: { 'm.relations': { 'm.replace': { event_id: '$e1', sender: BOB, origin_server_ts: 2000 } } },
  });
  assert.deepEqual(S.missingBundledEdits([original], []), []);
  assert.deepEqual(summary(S.resolveSearchHits([hit(original)], [], 'hello')), [
    ['$a', '$a', 'hello world', false],
  ]);
});

test('replacement in a different room or with a different type is not trusted', () => {
  const hits = [
    hit(edit('$e1', '$a', 'hello other room', { room_id: '!other:x' })),
    hit(edit('$e2', '$a', 'hello sticker', { type: 'm.sticker' })),
    hit(msg('$a', 'hello world')),
  ];
  assert.deepEqual(summary(S.resolveSearchHits(hits, [], 'hello')), [
    ['$a', '$a', 'hello world', false],
  ]);
});

test('same term in old and new text: one result, new text', () => {
  const hits = [hit(msg('$a', 'pizza tonight')), hit(edit('$e1', '$a', 'pizza tomorrow'))];
  const r = S.resolveSearchHits(hits, [], 'pizza');
  assert.deepEqual(summary(r), [['$a', '$a', 'pizza tomorrow', true]]);
  assert.equal(r[0].rank, 1);
});

test('reply relation of the original is kept on the displayed event', () => {
  const original = msg('$a', 'hello', {
    content: { msgtype: 'm.text', body: 'hello', 'm.relates_to': { 'm.in_reply_to': { event_id: '$p' } } },
  });
  const r = S.resolveSearchHits([hit(original), hit(edit('$e1', '$a', 'hello again'))], [], 'hello');
  assert.equal(r[0].event.content['m.relates_to']['m.in_reply_to'].event_id, '$p');
});

test('pagination: duplicates across pages are dropped, same-room groups merged', () => {
  const page1 = S.resolveSearchHits(
    [hit(msg('$a', 'hello a')), hit(msg('$b', 'hello b', { room_id: '!r2:x' }))],
    [],
    'hello'
  );
  const page2 = S.resolveSearchHits(
    [hit(edit('$e1', '$b', 'hello b2', { room_id: '!r2:x' })), hit(msg('$c', 'hello c', { room_id: '!r2:x' }))],
    [msg('$b', 'hello b', { room_id: '!r2:x' })],
    'hello'
  );
  const groups = S.mergeSearchPages([page1, page2]);
  assert.deepEqual(
    groups.map((g) => [g.roomId, g.items.map((i) => i.originalEventId)]),
    [
      [ROOM, ['$a']],
      ['!r2:x', ['$b', '$c']],
    ]
  );
});

test('textMatchesTerm: prefix, case, diacritics, or, negation', () => {
  assert.equal(S.textMatchesTerm('Hallo Wélt', 'welt'), true);
  assert.equal(S.textMatchesTerm('running fast', 'run'), true);
  assert.equal(S.textMatchesTerm('hello world', 'hello moon'), false);
  assert.equal(S.textMatchesTerm('hello world', 'moon or world'), true);
  assert.equal(S.textMatchesTerm('hello world', 'hello -world'), false);
  assert.equal(S.textMatchesTerm('hello world', '"hello world"'), true);
});
