// Hardware-free tests for the profile re-announcement rules (late joiners).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/diddy/reannounce.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

function setup() {
  const sent = [];
  const timers = new Map();
  let now = 1_700_000_000_000;
  let nextId = 1;
  const clock = {
    now: () => now,
    start: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    stop: (id) => timers.delete(id),
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, console });
  const { ReAnnouncer, ANNOUNCE_DEBOUNCE_MS, ANNOUNCE_MIN_INTERVAL_MS, MAX_ANNOUNCE_ROOMS } =
    exports;
  const announcer = new ReAnnouncer(clock, (roomId) => sent.push({ roomId, at: now }));
  const advance = (ms) => {
    now += ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      if (!due.length) return;
      const [id, timer] = due[0];
      timers.delete(id);
      timer.run();
    }
  };
  return {
    sent,
    announcer,
    advance,
    now: () => now,
    ANNOUNCE_DEBOUNCE_MS,
    ANNOUNCE_MIN_INTERVAL_MS,
    MAX_ANNOUNCE_ROOMS,
  };
}

test('our own join announces the profile once, after a short collection window', () => {
  const s = setup();
  assert.equal(s.announcer.schedule('!room:example.org', { force: true }), true);
  assert.equal(s.sent.length, 0);
  s.advance(s.ANNOUNCE_DEBOUNCE_MS - 1);
  assert.equal(s.sent.length, 0);
  s.advance(1);
  assert.deepEqual(
    s.sent.map((e) => e.roomId),
    ['!room:example.org']
  );
  assert.equal(s.announcer.queued, 0);
});

test('several members joining at once cause exactly one send', () => {
  const s = setup();
  const at = s.now();
  for (let i = 0; i < 40; i += 1) {
    s.announcer.schedule('!room:example.org', { joinTs: at + i * 100 });
  }
  assert.equal(s.announcer.queued, 1);
  s.advance(s.ANNOUNCE_DEBOUNCE_MS);
  assert.equal(s.sent.length, 1);
});

test('later joins are answered again, but never more often than every quiet period', () => {
  const s = setup();
  s.announcer.schedule('!room:example.org', { force: true });
  s.advance(s.ANNOUNCE_DEBOUNCE_MS);
  assert.equal(s.sent.length, 1);

  const last = s.now();
  // a join we have already answered stays ignored, even when it arrives late in the sync
  assert.equal(s.announcer.schedule('!room:example.org', { joinTs: last - 5 }), false);
  // a newer join inside the quiet period is not dropped: it is answered when the period is over
  s.advance(60 * 1000);
  assert.equal(s.announcer.schedule('!room:example.org', { joinTs: last + 60_000 }), true);
  s.advance(s.ANNOUNCE_MIN_INTERVAL_MS - 60_000 - 1);
  assert.equal(s.sent.length, 1);
  s.advance(1);
  assert.equal(s.sent.length, 2);
  assert.equal(s.sent[1].at - last, s.ANNOUNCE_MIN_INTERVAL_MS);
  // several joins in the quiet period still cause one send
  const again = s.now();
  s.advance(30 * 1000);
  s.announcer.schedule('!room:example.org', { joinTs: again + 10_000 });
  s.announcer.schedule('!room:example.org', { joinTs: again + 20_000 });
  assert.equal(s.announcer.queued, 1);
  s.advance(s.ANNOUNCE_MIN_INTERVAL_MS);
  assert.equal(s.sent.length, 3);
});

test('a profile write counts as an announcement and cancels the need to repeat it', () => {
  const s = setup();
  s.announcer.markSent('!room:example.org');
  assert.equal(s.announcer.schedule('!room:example.org', { joinTs: s.now() - 1000 }), false);
});

test('leaving a room cancels what is queued for it', () => {
  const s = setup();
  s.announcer.schedule('!room:example.org', { force: true });
  s.announcer.forget('!room:example.org');
  s.advance(s.ANNOUNCE_DEBOUNCE_MS * 2);
  assert.equal(s.sent.length, 0);
  assert.equal(s.announcer.queued, 0);
});

test('closing cancels every queued send, e.g. when the client object is replaced', () => {
  const s = setup();
  s.announcer.schedule('!a:example.org', { force: true });
  s.announcer.schedule('!b:example.org', { force: true });
  s.announcer.close();
  s.advance(s.ANNOUNCE_DEBOUNCE_MS * 2);
  assert.equal(s.sent.length, 0);
});

test('only a bounded number of rooms can wait at the same time', () => {
  const s = setup();
  for (let i = 0; i < s.MAX_ANNOUNCE_ROOMS; i += 1) {
    assert.equal(s.announcer.schedule(`!room${i}:example.org`, { force: true }), true);
  }
  assert.equal(s.announcer.schedule('!overflow:example.org', { force: true }), false);
  s.advance(s.ANNOUNCE_DEBOUNCE_MS);
  assert.equal(s.sent.length, s.MAX_ANNOUNCE_ROOMS);
});

test('a custom timing (badges) is respected and does not change the defaults', () => {
  const sent = [];
  const timers = new Map();
  let now = 1_700_000_000_000;
  let nextId = 1;
  const clock = {
    now: () => now,
    start: (run, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    stop: (id) => timers.delete(id),
  };
  const advance = (ms) => {
    now += ms;
    [...timers.entries()]
      .filter(([, t]) => t.at <= now)
      .forEach(([id, t]) => {
        timers.delete(id);
        t.run();
      });
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, console });
  const a = new exports.ReAnnouncer(clock, (r) => sent.push(r), {
    debounceMs: 60_000,
    minIntervalMs: 900_000,
  });
  a.schedule('!r:example.org', { force: true });
  advance(59_999);
  assert.equal(sent.length, 0);
  advance(1);
  assert.equal(sent.length, 1);
  // 10 minutes later is still inside the 15 minute quiet period: answered after it, not before
  advance(600_000);
  assert.equal(a.schedule('!r:example.org', { joinTs: now }), true);
  advance(299_999);
  assert.equal(sent.length, 1);
  advance(1);
  assert.equal(sent.length, 2);
});

const recentOwnCompiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/plugins/diddy/recentOwn.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 } }
).outputText;

function recentOwn() {
  const exports = {};
  vm.runInNewContext(recentOwnCompiled, { exports, console });
  return new exports.RecentOwnData();
}

test('app start skips own entries that are still among the newest events', () => {
  const r = recentOwn();
  r.noteRecent('!a', 'app.diddy.profile', '@me:x', 2000);
  r.markScanned('!a');
  r.comingOnline('!a');
  assert.equal(r.takeOnlineOnly('!a', 'profile'), true);
  assert.equal(r.isRecent('!a', 'app.diddy.profile', '@me:x', 1000), true);
  assert.equal(r.isRecent('!a', 'app.diddy.badge', 'c.x', 1000), false);
  // consumed: the next send is a normal one
  assert.equal(r.takeOnlineOnly('!a', 'profile'), false);
  // the badge channel keeps its own flag
  assert.equal(r.takeOnlineOnly('!a', 'badges'), true);
});

test('nothing counts as recent before the room was read completely', () => {
  const r = recentOwn();
  r.noteRecent('!a', 'app.diddy.profile', '@me:x', 2000);
  assert.equal(r.isRecent('!a', 'app.diddy.profile', '@me:x', 1000), false);
});

test('a join of another member always sends everything', () => {
  const r = recentOwn();
  r.comingOnline('!a');
  r.needEverything('!a');
  assert.equal(r.takeOnlineOnly('!a', 'profile'), false);
  assert.equal(r.takeOnlineOnly('!a', 'badges'), false);
});

test('leaving a room forgets what was seen there', () => {
  const r = recentOwn();
  r.noteRecent('!a', 'app.diddy.profile', '@me:x', 2000);
  r.markScanned('!a');
  r.comingOnline('!a');
  r.forget('!a');
  assert.equal(r.isRecent('!a', 'app.diddy.profile', '@me:x', 1000), false);
  assert.equal(r.takeOnlineOnly('!a', 'profile'), false);
});

test('a member who joined after our newest event still gets it again', () => {
  const r = recentOwn();
  r.noteRecent('!a', 'app.diddy.profile', '@me:x', 2000);
  r.noteRecent('!a', 'app.diddy.profile', '@me:x', 1500);
  r.markScanned('!a');
  assert.equal(r.isRecent('!a', 'app.diddy.profile', '@me:x', 1999), true);
  assert.equal(r.isRecent('!a', 'app.diddy.profile', '@me:x', 2500), false);
  assert.equal(r.isRecent('!a', 'app.diddy.profile', '@me:x', Infinity), false);
});
