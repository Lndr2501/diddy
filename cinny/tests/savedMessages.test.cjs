// Saved messages (bookmarks) in the account data: list rules, limit and merging two devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function compile(file, requireFn) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/utils', file), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(out, { exports, require: requireFn });
  return exports;
}

const replyPreview = compile('replyPreview.ts');
const raw = compile('savedMessages.ts', (name) => {
  if (name === './replyPreview') return replyPreview;
  throw new Error(`unexpected import ${name}`);
});
// results come from another vm realm; copy them so deepEqual compares plain values
const plain = (value) => JSON.parse(JSON.stringify(value));
const S = Object.fromEntries(
  Object.entries(raw).map(([k, v]) => [k, typeof v === 'function' ? (...a) => plain(v(...a)) : v])
);

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const R1 = '!one:example.org';
const R2 = '!two:example.org';

test('uses a Diddy account data type', () => {
  assert.equal(S.SAVED_MESSAGES_TYPE, 'app.diddy.saved_messages');
  assert.equal(S.SAVED_MESSAGES_LIMIT, 300);
});

test('saving puts the message on top, once', () => {
  let state = S.emptySavedMessages();
  let step = S.saveMessage(state, R1, '$a', NOW);
  assert.equal(step.result, 'saved');
  state = step.state;
  step = S.saveMessage(state, R2, '$b', NOW + 1);
  state = step.state;
  assert.deepEqual(
    state.saved.map((item) => item.event_id),
    ['$b', '$a']
  );
  step = S.saveMessage(state, R1, '$a', NOW + 2);
  assert.equal(step.result, 'already');
  assert.deepEqual(step.state, state);
  assert.equal(S.isMessageSaved(state, R1, '$a'), true);
  assert.equal(S.isMessageSaved(state, R2, '$a'), false, 'the room is part of the key');
});

test('stores only room, event and time, never message content', () => {
  const { state } = S.saveMessage(S.emptySavedMessages(), R1, '$a', NOW);
  const content = S.toSavedMessagesContent(state);
  assert.deepEqual(content, {
    version: 1,
    saved: [{ room_id: R1, event_id: '$a', saved_ts: NOW }],
    removed: [],
  });
});

test('a full list refuses one more and keeps what it has', () => {
  let state = S.emptySavedMessages();
  const saved = [];
  for (let i = 0; i < S.SAVED_MESSAGES_LIMIT; i += 1) {
    saved.push({ room_id: R1, event_id: `$e${i}`, saved_ts: NOW - i });
  }
  state = S.parseSavedMessages({ saved }, NOW);
  assert.equal(state.saved.length, 300);
  const step = S.saveMessage(state, R2, '$new', NOW + 1);
  assert.equal(step.result, 'full');
  assert.equal(step.state.saved.length, 300);
  assert.equal(S.isMessageSaved(step.state, R2, '$new'), false);
  // removing one makes room again
  const fewer = S.removeSavedMessages(state, [{ room_id: R1, event_id: '$e3' }], NOW + 2);
  assert.equal(S.saveMessage(fewer, R2, '$new', NOW + 3).result, 'saved');
});

test('a full list stays below the 64 KB event size', () => {
  const saved = [];
  for (let i = 0; i < S.SAVED_MESSAGES_LIMIT; i += 1) {
    saved.push({
      room_id: `!${'r'.repeat(18)}:matrix.example.org`,
      event_id: `$${String(i).padStart(43, 'x')}`,
      saved_ts: NOW - i,
    });
  }
  const state = S.parseSavedMessages({ saved }, NOW);
  const removed = [];
  for (let i = 0; i < S.SAVED_REMOVED_LIMIT; i += 1) {
    removed.push({ room_id: R1, event_id: `$gone${i}`, removed_ts: NOW - i });
  }
  // the markers alone take room too; together they still fit
  const full = S.mergeSavedMessages(state, { removed }, NOW);
  const bytes = Buffer.byteLength(JSON.stringify(S.toSavedMessagesContent(full)));
  assert.ok(bytes < 65536, `content is ${bytes} bytes`);
});

test('parsing skips malformed entries and keeps the newest duplicate', () => {
  const state = S.parseSavedMessages(
    {
      saved: [
        { room_id: R1, event_id: '$a', saved_ts: NOW - 10 },
        { room_id: R1, event_id: '$a', saved_ts: NOW },
        { room_id: 'nope', event_id: '$b', saved_ts: NOW },
        { room_id: R1, event_id: 'b', saved_ts: NOW },
        { room_id: R1, event_id: '$c' },
        { room_id: R1, event_id: '$d', saved_ts: 'soon' },
        null,
        'x',
      ],
      removed: 'nope',
    },
    NOW
  );
  assert.deepEqual(state, { saved: [{ room_id: R1, event_id: '$a', saved_ts: NOW }], removed: [] });
  assert.deepEqual(S.parseSavedMessages(null, NOW), { saved: [], removed: [] });
  assert.deepEqual(S.parseSavedMessages({ saved: {} }, NOW), { saved: [], removed: [] });
});

test('two devices saving at the same time keep both', () => {
  const base = S.saveMessage(S.emptySavedMessages(), R1, '$a', NOW).state;
  const phone = S.saveMessage(base, R1, '$phone', NOW + 5).state;
  const desktop = S.saveMessage(base, R2, '$desktop', NOW + 6).state;
  const merged = S.mergeSavedMessages(phone, desktop, NOW + 7);
  assert.deepEqual(
    merged.saved.map((item) => item.event_id),
    ['$desktop', '$phone', '$a']
  );
  assert.deepEqual(merged, S.mergeSavedMessages(desktop, phone, NOW + 7), 'order does not matter');
  assert.deepEqual(
    S.mergeSavedMessages(merged, merged, NOW + 7),
    merged,
    'merging again changes nothing'
  );
});

test('a removal on one device is not undone by the other one', () => {
  const base = S.parseSavedMessages(
    {
      saved: [
        { room_id: R1, event_id: '$a', saved_ts: NOW },
        { room_id: R1, event_id: '$b', saved_ts: NOW + 1 },
      ],
    },
    NOW
  );
  const phone = S.removeSavedMessages(base, [{ room_id: R1, event_id: '$a' }], NOW + 10);
  assert.equal(S.isMessageSaved(phone, R1, '$a'), false);
  assert.equal(phone.removed.length, 1);
  // the desktop still has the old list and saves something else
  const desktop = S.saveMessage(base, R2, '$c', NOW + 11).state;
  const merged = S.mergeSavedMessages(desktop, phone, NOW + 12);
  assert.deepEqual(
    merged.saved.map((item) => item.event_id),
    ['$c', '$b']
  );
});

test('saving again after a removal wins, even with a clock that is behind', () => {
  let state = S.saveMessage(S.emptySavedMessages(), R1, '$a', NOW).state;
  // the other device's clock is a minute ahead
  state = S.removeSavedMessages(state, [{ room_id: R1, event_id: '$a' }], NOW + 60_000);
  const again = S.saveMessage(state, R1, '$a', NOW + 5);
  assert.equal(again.result, 'saved');
  assert.equal(S.isMessageSaved(again.state, R1, '$a'), true);
  assert.equal(again.state.saved[0].saved_ts, NOW + 60_001);
  assert.equal(again.state.removed.length, 0, 'the marker is gone once it is saved again');
  // and removing it with the slow clock still removes it
  const gone = S.removeSavedMessages(again.state, [{ room_id: R1, event_id: '$a' }], NOW + 6);
  assert.equal(S.isMessageSaved(gone, R1, '$a'), false);
});

test('removal markers expire after 30 days and are capped', () => {
  let state = S.saveMessage(S.emptySavedMessages(), R1, '$a', NOW).state;
  state = S.removeSavedMessages(state, [{ room_id: R1, event_id: '$a' }], NOW + 1);
  assert.equal(S.parseSavedMessages(state, NOW + 29 * DAY).removed.length, 1);
  assert.equal(S.parseSavedMessages(state, NOW + 31 * DAY).removed.length, 0);
  const removed = [];
  for (let i = 0; i < 150; i += 1)
    removed.push({ room_id: R1, event_id: `$r${i}`, removed_ts: NOW - i });
  const capped = S.parseSavedMessages({ removed }, NOW);
  assert.equal(capped.removed.length, S.SAVED_REMOVED_LIMIT);
  assert.equal(capped.removed[0].event_id, '$r0', 'the newest markers stay');
});

test('removing several entries at once (unloadable ones) and unknown ones', () => {
  const state = S.parseSavedMessages(
    {
      saved: [
        { room_id: R1, event_id: '$a', saved_ts: NOW },
        { room_id: R2, event_id: '$b', saved_ts: NOW + 1 },
        { room_id: R2, event_id: '$c', saved_ts: NOW + 2 },
      ],
    },
    NOW
  );
  const next = S.removeSavedMessages(
    state,
    [
      { room_id: R2, event_id: '$b' },
      { room_id: R2, event_id: '$c' },
      { room_id: R2, event_id: '$unknown' },
    ],
    NOW + 3
  );
  assert.deepEqual(
    next.saved.map((item) => item.event_id),
    ['$a']
  );
  assert.equal(next.removed.length, 2);
  assert.deepEqual(S.removeSavedMessages(state, [{ room_id: R1, event_id: '$x' }], NOW), state);
});

test('a merge over the limit keeps the newest', () => {
  const a = [];
  const b = [];
  for (let i = 0; i < 200; i += 1) {
    a.push({ room_id: R1, event_id: `$a${i}`, saved_ts: NOW - 2 * i });
    b.push({ room_id: R2, event_id: `$b${i}`, saved_ts: NOW - 2 * i - 1 });
  }
  const merged = S.mergeSavedMessages({ saved: a }, { saved: b }, NOW);
  assert.equal(merged.saved.length, 300);
  assert.equal(merged.saved[0].event_id, '$a0');
  assert.equal(merged.saved[299].saved_ts, NOW - 299);
});

test('rewrite is needed only when the server misses something of ours', () => {
  const ours = S.saveMessage(S.emptySavedMessages(), R1, '$a', NOW).state;
  const content = S.toSavedMessagesContent(ours);
  assert.equal(S.savedNeedsRewrite(content, ours, NOW + 1), false);
  // another device wrote its list over ours
  const theirs = S.saveMessage(S.emptySavedMessages(), R2, '$b', NOW + 1).state;
  assert.equal(S.savedNeedsRewrite(S.toSavedMessagesContent(theirs), ours, NOW + 2), true);
  // the server has more than we know: nothing to write
  const both = S.mergeSavedMessages(ours, theirs, NOW + 2);
  assert.equal(S.savedNeedsRewrite(S.toSavedMessagesContent(both), ours, NOW + 3), false);
  assert.equal(S.savedNeedsRewrite(null, S.emptySavedMessages(), NOW), false);
  assert.equal(S.savedNeedsRewrite(null, ours, NOW), true);
});

test('preview line by message type', () => {
  const P = S.savedMessagePreview;
  assert.equal(P('m.room.message', { msgtype: 'm.text', body: 'hello' }), 'hello');
  assert.equal(
    P('m.room.message', { msgtype: 'm.text', body: '> <@a:x> quoted\n\nmy answer' }),
    'my answer'
  );
  assert.equal(
    P('m.room.message', { msgtype: 'm.text', body: 'hi [Lndr](https://matrix.to/#/@lndr:x)' }),
    'hi Lndr'
  );
  assert.equal(P('m.room.message', { msgtype: 'm.image', body: 'cat.png' }), 'Photo: cat.png');
  assert.equal(P('m.room.message', { msgtype: 'm.image' }), 'Photo');
  assert.equal(
    P('m.room.message', { msgtype: 'm.file', body: 'x', filename: 'a.pdf' }),
    'File: a.pdf'
  );
  assert.equal(P('m.room.message', { msgtype: 'm.video', body: 'v.mp4' }), 'Video');
  assert.equal(
    P('m.room.message', { msgtype: 'm.audio', body: 'v', 'org.matrix.msc3245.voice': {} }),
    'Voice message'
  );
  assert.equal(P('m.room.message', { msgtype: 'm.audio', body: 'song.mp3' }), 'Audio');
  assert.equal(P('m.room.encrypted', {}), 'Encrypted message');
  assert.equal(P('m.sticker', { body: 'x' }), 'Sticker');
  assert.equal(P('m.room.message', { msgtype: 'm.text', body: '   ' }), 'Message');
  assert.equal(P('m.room.message', undefined), 'Message');
});
