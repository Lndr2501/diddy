// Hardware-free tests for "Watch together" (#83): YouTube links, the sync messages, the sync
// logic (drift, seeks, echo) and SponsorBlock (hash prefix, segment choice).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dir = path.join(__dirname, '../src/app/plugins/watchTogether');
const cache = {};
const load = (name) => {
  if (cache[name]) return cache[name];
  const filename = path.join(dir, `${name}.ts`);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  cache[name] = exports;
  vm.runInNewContext(
    compiled,
    {
      exports,
      URL,
      URLSearchParams,
      TextEncoder,
      crypto: crypto.webcrypto,
      require: (id) => {
        if (!id.startsWith('./')) throw new Error(`Unexpected import: ${id}`);
        return load(id.slice(2));
      },
    },
    { filename }
  );
  return exports;
};

const yt = load('youtube');
const proto = load('protocol');
const sb = load('sponsorBlock');
const { WatchController } = load('controller');

const ID = 'dQw4w9WgXcQ';
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// --- links ---------------------------------------------------------------------------------------

test('reads the video id and start time from YouTube links', () => {
  const cases = [
    [`https://www.youtube.com/watch?v=${ID}`, 0],
    [`https://youtube.com/watch?v=${ID}&t=90`, 90],
    [`youtube.com/watch?feature=share&v=${ID}&t=1m30s`, 90],
    [`https://m.youtube.com/watch?v=${ID}#t=1h2m3s`, 3723],
    [`https://music.youtube.com/watch?v=${ID}`, 0],
    [`https://youtu.be/${ID}?t=42`, 42],
    [`youtu.be/${ID}`, 0],
    [`https://www.youtube.com/shorts/${ID}`, 0],
    [`https://www.youtube.com/embed/${ID}?start=12`, 12],
    [`https://www.youtube-nocookie.com/embed/${ID}`, 0],
    [`https://www.youtube.com/live/${ID}?si=abc`, 0],
    [`  ${ID}  `, 0],
    [`https://youtu.be/${ID}?t=12.7s`, 12],
  ];
  cases.forEach(([url, start]) => {
    assert.deepEqual(plain(yt.parseYouTubeUrl(url)), { videoId: ID, start }, url);
  });
});

test('rejects links that are not a YouTube video', () => {
  [
    '',
    'hello',
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQQ',
    'https://www.youtube.com/watch?v=dQw4w9WgX<Q',
    `javascript:alert(1)//youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    'https://www.youtube.com/playlist?list=PL123',
    `https://youtu.be/${'x'.repeat(3000)}`,
  ].forEach((url) => assert.equal(yt.parseYouTubeUrl(url), undefined, url));
});

test('start times are clamped and garbage gives 0', () => {
  assert.equal(yt.parseStartTime('abc'), 0);
  assert.equal(yt.parseStartTime('-5'), 0);
  assert.equal(yt.parseStartTime('99999999'), yt.MAX_START);
  assert.equal(yt.parseStartTime('2m'), 120);
});

test('builds the nocookie embed URL with origin and referrer', () => {
  const url = new URL(yt.buildEmbedUrl(ID, 'tauri://localhost', 61.9));
  assert.equal(url.origin, 'https://www.youtube-nocookie.com');
  assert.equal(url.pathname, `/embed/${ID}`);
  assert.equal(url.searchParams.get('enablejsapi'), '1');
  assert.equal(url.searchParams.get('origin'), 'tauri://localhost');
  assert.equal(url.searchParams.get('widget_referrer'), 'tauri://localhost');
  assert.equal(url.searchParams.get('start'), '61');
  assert.equal(new URL(yt.buildEmbedUrl(ID, 'null')).searchParams.get('origin'), null);
  assert.throws(() => yt.buildEmbedUrl('../../x', 'http://127.0.0.1:44548'));
});

test('reads player messages and ignores anything else', () => {
  assert.deepEqual(plain(yt.parsePlayerMessage('{"event":"onReady"}')), { event: 'ready' });
  assert.deepEqual(plain(yt.parsePlayerMessage('{"event":"onStateChange","info":1}')), {
    event: 'state',
    state: 1,
  });
  assert.deepEqual(plain(yt.parsePlayerMessage('{"event":"onError","info":150}')), {
    event: 'error',
    code: 150,
  });
  const info = yt.parsePlayerMessage(
    JSON.stringify({
      event: 'infoDelivery',
      info: {
        currentTime: 12.5,
        playerState: 1,
        duration: 'x',
        playbackQuality: 'hd720',
        availableQualityLevels: ['hd720', '<b>', 3],
      },
    })
  );
  assert.deepEqual(plain(info), {
    event: 'info',
    info: {
      currentTime: 12.5,
      playerState: 1,
      playbackQuality: 'hd720',
      availableQualityLevels: ['hd720'],
    },
  });
  [
    undefined,
    42,
    'not json',
    '[]',
    '{"event":"onStateChange","info":"1"}',
    '{"event":"x"}',
  ].forEach((d) => assert.equal(yt.parsePlayerMessage(d), undefined, String(d)));
});

// --- messages ------------------------------------------------------------------------------------

const ROOM = '!room:example.org';
const goodState = () => ({
  v: 1,
  kind: 'state',
  room_id: ROOM,
  session: 'abcdEFGH1234',
  video_id: ID,
  state: 'playing',
  position: 12.5,
  rate: 1,
  ts: 1_700_000_000_000,
  seq: 3,
});

test('accepts well-formed messages', () => {
  assert.deepEqual(plain(proto.parseWatchMessage(goodState())), {
    kind: 'state',
    room: ROOM,
    session: 'abcdEFGH1234',
    videoId: ID,
    state: 'playing',
    position: 12.5,
    rate: 1,
    ts: 1_700_000_000_000,
    seq: 3,
  });
  assert.deepEqual(plain(proto.parseWatchMessage({ v: 1, kind: 'request', room_id: ROOM })), {
    kind: 'request',
    room: ROOM,
  });
});

test('drops malformed messages', () => {
  const bad = [
    null,
    'x',
    [],
    { ...goodState(), v: 2 },
    { ...goodState(), kind: 'eval' },
    { ...goodState(), room_id: 'room' },
    { ...goodState(), video_id: 'abc' },
    { ...goodState(), video_id: `${ID}x` },
    { ...goodState(), video_id: 12345678901 },
    { ...goodState(), session: 'a b' },
    { ...goodState(), session: 'short' },
    { ...goodState(), state: 'rewinding' },
    { ...goodState(), position: -1 },
    { ...goodState(), position: 1e12 },
    { ...goodState(), position: '12' },
    { ...goodState(), position: NaN },
    { ...goodState(), rate: 100 },
    { ...goodState(), rate: 0 },
    { ...goodState(), ts: Infinity },
    { ...goodState(), seq: 1.5 },
    { ...goodState(), seq: -1 },
    { ...goodState(), seq: 1e15 },
  ];
  bad.forEach((m) => assert.equal(proto.parseWatchMessage(m), undefined, JSON.stringify(m)));
});

test('round-trips the wire format', () => {
  const shared = proto.startWatch(ID, 30, undefined, '@a:x', 1000, () => 0.5);
  const parsed = proto.parseWatchMessage(proto.stateContent(ROOM, shared));
  assert.equal(parsed.session, shared.session);
  assert.equal(parsed.position, 30);
  assert.equal(parsed.seq, 1);
});

test('last writer wins by seq, ties go to the larger sender id', () => {
  const a = { ...proto.startWatch(ID, 0, undefined, '@a:x', 1000), seq: 5 };
  assert.equal(proto.isNewer({ ...a, seq: 6 }, a), true);
  assert.equal(proto.isNewer({ ...a, seq: 4 }, a), false);
  assert.equal(proto.isNewer({ ...a, sender: '@b:x' }, a), true);
  assert.equal(proto.isNewer({ ...a, sender: '@0:x' }, a), false);
  assert.equal(proto.isNewer(a, a), false);
  assert.equal(proto.isNewer(a, undefined), true);
});

test('expected position follows the clock while playing; clocks far off are replaced', () => {
  const s = { ...proto.startWatch(ID, 10, undefined, '@a:x', 1000), rate: 2 };
  assert.equal(proto.expectedPosition(s, 4000), 16);
  assert.equal(proto.expectedPosition({ ...s, state: 'paused' }, 4000), 10);
  assert.equal(proto.expectedPosition(s, 0), 10);
  const msg = proto.parseWatchMessage(goodState());
  assert.equal(proto.fromMessage(msg, '@a:x', msg.ts + 500).ts, msg.ts);
  assert.equal(proto.fromMessage(msg, '@a:x', msg.ts - 5000).ts, msg.ts - 5000);
  assert.equal(proto.fromMessage(msg, '@a:x', msg.ts + 3_600_000).ts, msg.ts + 3_600_000);
  const rebased = proto.rebase(s, 2000);
  assert.equal(rebased.position, 12);
  assert.equal(rebased.ts, 2000);
});

test('local changes go one above the current seq', () => {
  const s = proto.startWatch(ID, 0, { seq: 7 }, '@a:x', 0);
  assert.equal(s.seq, 8);
  const next = proto.nextChange(s, { state: 'paused', position: 5 }, '@b:x', 9000);
  assert.equal(next.seq, 9);
  assert.equal(next.sender, '@b:x');
  assert.equal(next.position, 5);
  assert.equal(next.session, s.session);
  assert.equal(proto.nextChange(s, { rate: 50 }, '@b:x', 0).rate, proto.MAX_RATE);
  assert.match(proto.newSessionId(), /^[A-Za-z0-9]{16}$/);
});

// --- sync logic ----------------------------------------------------------------------------------

const P = yt.PlayerState;
const shared = (patch = {}) => ({
  session: 'abcdEFGH1234',
  videoId: ID,
  state: 'playing',
  position: 100,
  rate: 1,
  ts: 10_000,
  seq: 1,
  sender: '@a:x',
  ...patch,
});
const sample = (position, state, at, extra = {}) => ({ position, state, rate: 1, at, ...extra });

test('a late joiner is brought to the shared position and started', () => {
  const c = new WatchController();
  c.setShared(shared());
  const r = c.tick(sample(0, P.Unstarted, 20_000), 20_000);
  assert.deepEqual(plain(r.commands), [{ kind: 'seek', to: 110 }, { kind: 'play' }]);
  assert.equal(r.change, undefined);
});

test('small drift is left alone, more than 1.5 s is corrected', () => {
  const c = new WatchController();
  c.setShared(shared());
  assert.deepEqual(plain(c.tick(sample(111.2, P.Playing, 20_000), 20_000).commands), []);
  const c2 = new WatchController();
  c2.setShared(shared());
  assert.deepEqual(plain(c2.tick(sample(108, P.Playing, 20_000), 20_000).commands), [
    { kind: 'seek', to: 110 },
  ]);
});

test('a buffering stall is corrected, not taken as a user seek', () => {
  const c = new WatchController();
  c.setShared(shared({ ts: 20_000, position: 110 }));
  c.tick(sample(110, P.Playing, 20_000), 20_000);
  c.tick(sample(110.2, P.Buffering, 20_500), 20_500);
  c.tick(sample(110.2, P.Buffering, 21_000), 21_000);
  const r = c.tick(sample(110.2, P.Buffering, 22_000), 22_000);
  assert.equal(r.change, undefined);
  assert.deepEqual(plain(r.commands), [{ kind: 'seek', to: 112 }]);
});

test('a jump in the player that we did not cause is a seek for everybody', () => {
  const c = new WatchController();
  c.setShared(shared({ ts: 20_000, position: 110 }));
  c.tick(sample(110, P.Playing, 20_000), 20_000);
  const r = c.tick(sample(300, P.Buffering, 20_500), 20_500);
  assert.deepEqual(plain(r.change), { position: 300 });
  assert.deepEqual(plain(r.commands), []);
  // paused, scrubbed back
  const p = new WatchController();
  p.setShared(shared({ state: 'paused', position: 50 }));
  p.tick(sample(50, P.Paused, 20_000), 20_000);
  assert.deepEqual(plain(p.tick(sample(20, P.Paused, 20_500), 20_500).change), { position: 20 });
});

test('jumps while the player starts up are not taken for user seeks', () => {
  const c = new WatchController();
  c.setShared(shared({ ts: 20_000, position: 45 }));
  // the frame reports 0 first, then jumps to its start parameter (30)
  assert.deepEqual(plain(c.tick(sample(0, P.Buffering, 20_000), 20_000).commands), [
    { kind: 'seek', to: 45 },
  ]);
  c.tick(sample(0, P.Buffering, 20_500), 20_500);
  c.tick(sample(0, P.Buffering, 21_000), 21_000);
  const r = c.tick(sample(30, P.Playing, 21_500), 21_500);
  assert.equal(r.change, undefined);
  assert.deepEqual(plain(r.commands), [{ kind: 'seek', to: 46.5 }]);
});

test('our own seeks are not echoed back as user seeks', () => {
  const c = new WatchController();
  c.setShared(shared({ ts: 20_000, position: 110 }));
  c.tick(sample(110, P.Playing, 20_000), 20_000);
  // someone else seeks to 400
  c.setShared(shared({ ts: 20_400, position: 400, seq: 2, sender: '@b:x' }));
  const r = c.tick(sample(110.4, P.Playing, 20_500), 20_500);
  assert.deepEqual(plain(r.commands), [{ kind: 'seek', to: 400.1 }]);
  const after = c.tick(sample(400.2, P.Playing, 21_000), 21_000);
  assert.equal(after.change, undefined);
  assert.equal(c.onPlayerState(P.Buffering, 400, 21_000), undefined);
  // after the quiet period the player follows normally
  assert.equal(c.tick(sample(401.7, P.Playing, 23_000), 23_000).change, undefined);
});

test('play and pause in the player become changes, unless they echo the shared state', () => {
  const c = new WatchController();
  c.setShared(shared());
  assert.deepEqual(plain(c.onPlayerState(P.Paused, 105, 20_000)), {
    state: 'paused',
    position: 105,
  });
  assert.equal(c.onPlayerState(P.Playing, 105, 20_000), undefined);
  c.setShared(shared({ state: 'paused' }));
  assert.deepEqual(plain(c.onPlayerState(P.Playing, 100, 20_000)), {
    state: 'playing',
    position: 100,
  });
  // right after we commanded the player its events are ours
  c.tick(sample(100, P.Playing, 20_000), 20_000); // -> pause command
  assert.equal(c.onPlayerState(P.Playing, 100, 20_100), undefined);
  assert.equal(c.onPlayerRate(1.5, 20_100), undefined);
  assert.deepEqual(plain(c.onPlayerRate(1.5, 30_000)), { rate: 1.5 });
  assert.equal(c.onPlayerRate(16, 30_000), undefined);
});

test('the shared state is followed: pause, speed, end of video, stopped', () => {
  const c = new WatchController();
  c.setShared(shared({ state: 'paused' }));
  assert.deepEqual(plain(c.tick(sample(100, P.Playing, 20_000, { rate: 2 }), 20_000).commands), [
    { kind: 'pause' },
    { kind: 'rate', rate: 1 },
  ]);
  const e = new WatchController();
  e.setShared(shared());
  assert.deepEqual(
    plain(e.tick(sample(200, P.Ended, 400_000, { duration: 200 }), 400_000).commands),
    []
  );
  const s = new WatchController();
  s.setShared(shared({ state: 'stopped' }));
  assert.deepEqual(plain(s.tick(sample(0, P.Playing, 20_000), 20_000).commands), []);
});

test('blocked autoplay is retried slowly', () => {
  const c = new WatchController({ playRetryMs: 2500 });
  c.setShared(shared({ ts: 20_000, position: 0 }));
  assert.deepEqual(plain(c.tick(sample(0, P.Unstarted, 20_000), 20_000).commands), [
    { kind: 'play' },
  ]);
  assert.deepEqual(plain(c.tick(sample(0, P.Unstarted, 20_000), 20_000).commands), []);
  assert.deepEqual(plain(c.tick(sample(0, P.Unstarted, 22_600), 22_600).commands), [
    { kind: 'seek', to: 2.6 },
    { kind: 'play' },
  ]);
});

// --- SponsorBlock --------------------------------------------------------------------------------

test('hash prefix is the first 4 hex characters of sha256(videoId)', async () => {
  const expected = crypto.createHash('sha256').update(ID).digest('hex').slice(0, 4);
  assert.equal(await sb.hashPrefix(ID), expected);
});

const answer = [
  { videoID: 'otherVideo1', segments: [{ category: 'sponsor', segment: [0, 50], UUID: 'x' }] },
  {
    videoID: ID,
    segments: [
      { category: 'selfpromo', segment: [300, 320], UUID: 'b', actionType: 'skip' },
      { category: 'sponsor', segment: [60, 90], UUID: 'a', actionType: 'skip' },
      { category: 'intro', segment: [0, 10], UUID: 'c', actionType: 'skip' },
      { category: 'sponsor', segment: [100, 120], UUID: 'd', actionType: 'mute' },
      { category: 'sponsor', segment: [130, 130.5], UUID: 'e' },
      { category: 'sponsor', segment: ['1', 20], UUID: 'f' },
      { category: 'sponsor', segment: [5e6, 5e6 + 10], UUID: 'g' },
      { category: 'evil', segment: [1, 20], UUID: 'h' },
    ],
  },
];

test('picks skippable segments of our video in the chosen categories', () => {
  const segs = sb.selectSegments(answer, ID, sb.DEFAULT_CATEGORIES);
  assert.deepEqual(
    plain(segs).map((s) => [s.uuid, s.start, s.end]),
    [
      ['a', 60, 90],
      ['b', 300, 320],
    ]
  );
  assert.deepEqual(
    plain(sb.selectSegments(answer, ID, ['intro'])).map((s) => s.uuid),
    ['c']
  );
  assert.deepEqual(plain(sb.selectSegments({}, ID, ['sponsor'])), []);
  assert.deepEqual(plain(sb.selectSegments(answer, 'nothingHere', ['sponsor'])), []);
});

test('fetches by hash prefix only and fails silently', async () => {
  let asked;
  const ok = async (url) => {
    asked = url;
    return { ok: true, json: async () => answer };
  };
  const segs = await sb.fetchSegments(ID, ['sponsor'], ok);
  assert.equal(segs.length, 1);
  const prefix = crypto.createHash('sha256').update(ID).digest('hex').slice(0, 4);
  assert.ok(asked.startsWith(`https://sponsor.ajay.app/api/skipSegments/${prefix}?`));
  assert.ok(!asked.includes(ID));
  assert.deepEqual(plain(await sb.fetchSegments(ID, ['sponsor'], async () => ({ ok: false }))), []);
  const offline = async () => {
    throw new Error('offline');
  };
  assert.deepEqual(plain(await sb.fetchSegments(ID, ['sponsor'], offline)), []);
  assert.deepEqual(plain(await sb.fetchSegments(ID, [], ok)), []);
  assert.deepEqual(plain(await sb.fetchSegments('bad', ['sponsor'], ok)), []);
});

test('a segment is skipped once, and again after seeking back before it', () => {
  const segs = sb.selectSegments(answer, ID, sb.DEFAULT_CATEGORIES);
  const skipped = new Set();
  assert.equal(sb.segmentToSkip(segs, 50, skipped), undefined);
  assert.equal(sb.segmentToSkip(segs, 61, skipped).uuid, 'a');
  skipped.add('a');
  assert.equal(sb.segmentToSkip(segs, 70, skipped), undefined);
  assert.equal(sb.segmentToSkip(segs, 89.8, skipped), undefined);
  assert.equal(sb.segmentToSkip(segs, 30, skipped), undefined);
  assert.equal(sb.segmentToSkip(segs, 61, skipped).uuid, 'a');
});

test('the controller skips a segment as a seek for everybody', () => {
  const segs = sb.selectSegments(answer, ID, ['sponsor']);
  const c = new WatchController();
  c.setShared(shared({ ts: 20_000, position: 60.5 }));
  const r = c.tick(sample(60.5, P.Playing, 20_000), 20_000, segs);
  assert.deepEqual(plain(r.commands), [{ kind: 'seek', to: 90 }]);
  assert.deepEqual(plain(r.change), { position: 90 });
  assert.equal(r.skipped.uuid, 'a');
  // the change comes back as the shared state: no second skip
  c.setShared(shared({ ts: 20_000, position: 90, seq: 2 }));
  assert.equal(c.tick(sample(91, P.Playing, 21_000), 21_000, segs).skipped, undefined);
});
