// Send later: quick picks, server vs. this device, due checks and the server's delayed-event list
// (src/app/features/room/send-later/sendLaterLogic.ts). iOS mirrors the rules in
// ios/Diddy/Matrix/SendLaterLogic.swift (checked by ios/Tools/sendlater_check).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
  const file = path.join(__dirname, '../src/app/features/room/send-later/sendLaterLogic.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Date,
    Math,
    Number,
    Set,
    Array,
    require: (id) => {
      throw new Error(`sendLaterLogic.ts must stay free of imports, got ${id}`);
    },
  });
  return exports;
}

const L = load();
const plain = (v) => JSON.parse(JSON.stringify(v));
const eq = (actual, expected, message) => assert.deepEqual(plain(actual), expected, message);
const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test('quick picks in the afternoon: in an hour, today 18:00, tomorrow 9:00', () => {
  const now = local(2026, 11, 16, 14, 23) + 17 * 1000;
  const picks = L.quickPicks(now);
  eq(
    picks.map((p) => p.id),
    ['hour', 'evening', 'tomorrow']
  );
  assert.equal(picks[0].at, local(2026, 11, 16, 15, 23), 'one hour ahead, seconds dropped');
  assert.equal(picks[1].at, local(2026, 11, 16, 18));
  assert.equal(picks[2].at, local(2026, 11, 17, 9));
});

test('no "this evening" once it is less than half an hour away or past', () => {
  eq(
    L.quickPicks(local(2026, 11, 16, 17, 31)).map((p) => p.id),
    ['hour', 'tomorrow']
  );
  eq(
    L.quickPicks(local(2026, 11, 16, 17, 30)).map((p) => p.id),
    ['hour', 'evening', 'tomorrow']
  );
  eq(
    L.quickPicks(local(2026, 11, 16, 22, 0)).map((p) => p.id),
    ['hour', 'tomorrow']
  );
});

test('tomorrow 9:00 crosses month and year ends', () => {
  const picks = L.quickPicks(local(2026, 12, 31, 23, 50));
  assert.equal(picks.find((p) => p.id === 'tomorrow').at, local(2027, 1, 1, 9));
  assert.equal(picks.find((p) => p.id === 'hour').at, local(2027, 1, 1, 0, 50));
});

test('just after midnight "tomorrow" is the next calendar day, evening still today', () => {
  const picks = L.quickPicks(local(2026, 11, 17, 0, 10));
  assert.equal(picks.find((p) => p.id === 'evening').at, local(2026, 11, 17, 18));
  assert.equal(picks.find((p) => p.id === 'tomorrow').at, local(2026, 11, 18, 9));
});

test('picked times are checked', () => {
  const now = local(2026, 11, 16, 12);
  assert.equal(L.checkSendAt(now - 1, now), 'past');
  assert.equal(L.checkSendAt(now, now), 'past');
  assert.equal(L.checkSendAt(NaN, now), 'past');
  assert.equal(L.checkSendAt(now + 30 * 1000, now), 'too-soon');
  assert.equal(L.checkSendAt(now + MIN, now), 'ok');
  assert.equal(L.checkSendAt(now + 400 * 24 * HOUR, now), 'too-far');
  assert.equal(L.checkSendAt(now + 24 * HOUR, now), 'ok');
});

test('the free choice starts at the next full hour at least an hour away', () => {
  assert.equal(L.defaultCustomTime(local(2026, 11, 16, 12, 10)), local(2026, 11, 16, 14));
  assert.equal(L.defaultCustomTime(local(2026, 11, 16, 12, 0)), local(2026, 11, 16, 13));
  assert.equal(L.defaultCustomTime(local(2026, 11, 16, 23, 30)), local(2026, 11, 17, 1));
});

test('route: the server whenever it can', () => {
  const base = { serverSupport: true, delayMs: HOUR, encrypted: false, canEncryptAhead: true };
  eq(plain(L.chooseRoute(base)), {
    route: 'server',
    reason: 'server',
    encryptedAhead: false,
  });
  eq(plain(L.chooseRoute({ ...base, encrypted: true })), {
    route: 'server',
    reason: 'server',
    encryptedAhead: true,
  });
});

test('route: this device when the server cannot', () => {
  const base = { serverSupport: true, delayMs: 2 * HOUR, encrypted: false, canEncryptAhead: true };
  assert.equal(L.chooseRoute({ ...base, serverSupport: false }).reason, 'no-server-support');
  assert.equal(L.chooseRoute({ ...base, maxDelayMs: HOUR }).reason, 'too-far-for-server');
  assert.equal(L.chooseRoute({ ...base, maxDelayMs: 2 * HOUR }).route, 'server', 'limit inclusive');
  // iOS: the Rust SDK cannot encrypt without sending
  assert.equal(
    L.chooseRoute({ ...base, encrypted: true, canEncryptAhead: false }).reason,
    'encrypted-local'
  );
  assert.equal(L.chooseRoute({ ...base, preferLocal: true }).reason, 'chosen-local');
  assert.equal(L.chooseRoute({ ...base, preferLocal: true }).encryptedAhead, false);
  assert.equal(L.serverRoutePossible({ ...base, preferLocal: true }), true);
  assert.equal(L.serverRoutePossible({ ...base, serverSupport: false }), false);
});

test('max delay errors in Synapse and MSC form', () => {
  eq(
    plain(
      L.maxDelayExceeded({
        errcode: 'M_UNKNOWN',
        data: {
          errcode: 'M_UNKNOWN',
          'org.matrix.msc4140.errcode': 'M_MAX_DELAY_EXCEEDED',
          'org.matrix.msc4140.max_delay': 86400000,
        },
      })
    ),
    { maxDelayMs: 86400000 }
  );
  eq(
    plain(L.maxDelayExceeded({ errcode: 'M_MAX_DELAY_EXCEEDED', data: { max_delay: 3600000 } })),
    { maxDelayMs: 3600000 }
  );
  eq(plain(L.maxDelayExceeded({ errcode: 'M_MAX_DELAY_EXCEEDED' })), {});
  assert.equal(L.maxDelayExceeded({ errcode: 'M_FORBIDDEN', data: {} }), undefined);
  assert.equal(L.maxDelayExceeded(undefined), undefined);
});

test('the delayed event list keeps only scheduled messages', () => {
  const synapse = {
    delayed_events: [
      {
        delay_id: 'b',
        room_id: '!r:x',
        type: 'm.room.message',
        delay: 7200000,
        running_since: 1000,
        content: { msgtype: 'm.text', body: 'later' },
      },
      {
        delay_id: 'a',
        room_id: '!r:x',
        type: 'm.room.encrypted',
        delay: 60000,
        running_since: 1000,
        content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'x' },
      },
      // Element Call: the "left the call" state event waits here too
      {
        delay_id: 'c',
        room_id: '!r:x',
        type: 'org.matrix.msc3401.call.member',
        state_key: '_@me:x_DEV',
        delay: 8000,
        running_since: 1000,
        content: {},
      },
      {
        delay_id: 'd',
        room_id: '!r:x',
        type: 'm.room.message',
        state_key: '',
        delay: 1,
        running_since: 1,
        content: {},
      },
      { delay_id: 'e', room_id: '!r:x', type: 'm.room.message', content: {} },
      'junk',
    ],
  };
  const parsed = L.parseDelayedEvents(synapse);
  eq(
    parsed.map((p) => [p.delayId, p.sendAt]),
    [
      ['a', 61000],
      ['b', 7201000],
    ]
  );
  // the newer MSC shape
  const msc = L.parseDelayedEvents({ scheduled: [synapse.delayed_events[0]], finalised: [] });
  assert.equal(msc.length, 1);
  assert.equal(msc[0].roomId, '!r:x');
  eq(L.parseDelayedEvents(null), []);
  eq(L.parseDelayedEvents({}), []);
});

test('local messages become due at their time, server ones never locally', () => {
  const items = [
    { id: '1', route: 'local', sendAt: 300 },
    { id: '2', route: 'server', sendAt: 100 },
    { id: '3', route: 'local', sendAt: 100 },
    { id: '4', route: 'local', sendAt: 900 },
  ];
  eq(
    L.dueMessages(items, 300).map((m) => m.id),
    ['3', '1']
  );
  eq(L.dueMessages(items, 99), []);
  assert.equal(L.nextDueIn(items, 50), 50);
  assert.equal(L.nextDueIn(items, 1000), 0, 'overdue: right away');
  assert.equal(L.nextDueIn([{ route: 'server', sendAt: 5 }], 0), undefined);
  assert.equal(L.nextDueIn([], 0), undefined);
});

test('sent late after two minutes', () => {
  assert.equal(L.wasSentLate(0, 2 * MIN), false);
  assert.equal(L.wasSentLate(0, 2 * MIN + 1), true);
  assert.equal(L.wasSentLate(0, 10 * HOUR), true);
});

test('records are reconciled with the server list', () => {
  const items = [
    { id: 'l', route: 'local', sendAt: 1, createdAt: 1 },
    { id: 's1', route: 'server', delayId: 'd1', sendAt: 1, createdAt: 1 },
    { id: 's2', route: 'server', delayId: 'd2', sendAt: 1, createdAt: 1 },
    // scheduled while the list was on its way: not gone
    { id: 's3', route: 'server', delayId: 'd3', sendAt: 1, createdAt: 50 },
  ];
  const server = [
    { delayId: 'd1', roomId: '!r', type: 'm.room.message', content: {}, sendAt: 1 },
    { delayId: 'd9', roomId: '!r', type: 'm.room.message', content: {}, sendAt: 1 },
  ];
  const r = L.reconcileWithServer(items, server, 50);
  eq(
    r.keep.map((m) => m.id),
    ['l', 's1', 's3']
  );
  eq(
    r.gone.map((m) => m.id),
    ['s2']
  );
  eq(
    r.others.map((m) => m.delayId),
    ['d9']
  );
});

test('overview texts', () => {
  assert.equal(L.scheduledCountLabel(1), '1 scheduled message');
  assert.equal(L.scheduledCountLabel(3), '3 scheduled messages');
  assert.equal(L.messagePreview({ body: '\n  hello\nworld' }), 'hello');
  assert.equal(L.messagePreview({}), '');
  assert.equal(L.messagePreview({ body: 'x'.repeat(100) }, 10), `${'x'.repeat(9)}…`);
  eq(
    L.inRoom(
      [
        { roomId: 'a', sendAt: 2 },
        { roomId: 'b', sendAt: 1 },
        { roomId: 'a', sendAt: 1 },
      ],
      'a'
    ).map((m) => m.sendAt),
    [1, 2]
  );
});

test('times are written relative to today', () => {
  const now = local(2026, 11, 16, 14);
  assert.equal(L.formatSendAt(local(2026, 11, 16, 18), now, true), 'Today, 18:00');
  assert.equal(L.formatSendAt(local(2026, 11, 17, 9), now, true), 'Tomorrow, 09:00');
  assert.equal(L.formatSendAt(local(2026, 11, 17, 9), now, false), 'Tomorrow, 9:00 AM');
  assert.equal(L.formatSendAt(local(2026, 11, 16, 0, 5), now, false), 'Today, 12:05 AM');
  assert.equal(L.formatSendAt(local(2026, 11, 20, 12, 30), now, false), 'Fri 20 Nov, 12:30 PM');
  assert.equal(L.formatSendAt(local(2027, 1, 4, 8), now, true), 'Mon 4 Jan 2027, 08:00');
  assert.equal(L.formatSendAt(local(2026, 11, 15, 8), now, true), 'Yesterday, 08:00');
});

test('durations for the server limit', () => {
  assert.equal(L.formatDuration(24 * HOUR), '1 day');
  assert.equal(L.formatDuration(7 * 24 * HOUR), '7 days');
  assert.equal(L.formatDuration(HOUR), '1 hour');
  assert.equal(L.formatDuration(90 * MIN), '1 hour');
  assert.equal(L.formatDuration(30 * MIN), '30 minutes');
  assert.equal(L.formatDuration(1000), '1 minute');
});
