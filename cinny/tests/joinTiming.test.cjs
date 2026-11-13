// #161: the join timeline in the log, and the tile count it waits for.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/app/plugins/call/joinTiming.ts');
const mod = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText,
  { exports: mod, performance, URL }
);
const { createJoinTimer, countTiles, isLivekitTokenRequest, watchMediaConnected, isLivekitSignalUrl, watchLivekitSignal } = mod;

test('each step is logged once, with the time since the last step and since the start', () => {
  const lines = [];
  let t = 1000;
  const timer = createJoinTimer(
    (l) => lines.push(l),
    () => t
  );
  t = 1100;
  timer.mark('call page loaded');
  t = 1100;
  timer.mark('call page loaded');
  t = 3600;
  timer.mark('first tile shown');
  assert.deepEqual(lines, [
    'call join: call page loaded +100 ms (100 ms)',
    'call join: first tile shown +2500 ms (2600 ms)',
  ]);
});

test('tiles are counted from the call document, a missing or broken document counts 0', () => {
  assert.equal(countTiles(undefined), 0);
  assert.equal(countTiles(null), 0);
  assert.equal(
    countTiles({
      querySelectorAll: (sel) => (sel === '[data-testid="videoTile"]' ? [1, 2] : []),
    }),
    2
  );
  assert.equal(
    countTiles({
      querySelectorAll: () => {
        throw new Error('torn down');
      },
    }),
    0
  );
});

test('a detail is appended to the line but does not make a step new', () => {
  const lines = [];
  let t = 0;
  const timer = createJoinTimer(
    (l) => lines.push(l),
    () => t
  );
  t = 1500;
  timer.mark('LiveKit token request done', 'took 1200 ms, HTTP 200');
  t = 1600;
  timer.mark('LiveKit token request done', 'took 90 ms, HTTP 200');
  assert.deepEqual(lines, [
    'call join: LiveKit token request done +1500 ms (1500 ms), took 1200 ms, HTTP 200',
  ]);
});

test('the LiveKit token request of the call page is recognised (legacy and new endpoint)', () => {
  assert.equal(isLivekitTokenRequest('https://matrix.example.org/livekit/jwt/sfu/get'), true);
  assert.equal(isLivekitTokenRequest('https://matrix.example.org/livekit/jwt/get_token'), true);
  assert.equal(isLivekitTokenRequest('https://matrix.example.org/livekit/jwt/healthz'), false);
  assert.equal(
    isLivekitTokenRequest('tauri://localhost/public/element-call/assets/index-Dul-9Slf.js'),
    false
  );
  assert.equal(isLivekitTokenRequest('https://x.example/sfu/get/extra'), false);
  assert.equal(isLivekitTokenRequest('not a url'), false);
});

const connection = () => {
  const listeners = new Set();
  return {
    connectionState: 'new',
    addEventListener: (_event, fn) => listeners.add(fn),
    removeEventListener: (_event, fn) => listeners.delete(fn),
    change(state) {
      this.connectionState = state;
      [...listeners].forEach((fn) => fn());
    },
    get listenerCount() {
      return listeners.size;
    },
  };
};

test('media connection is reported once and releases its event listener', () => {
  const pc = connection();
  let calls = 0;
  const stop = watchMediaConnected(pc, () => {
    calls += 1;
  });
  pc.change('connecting');
  assert.equal(calls, 0);
  pc.change('connected');
  assert.equal(calls, 1);
  assert.equal(pc.listenerCount, 0);
  pc.change('disconnected');
  pc.change('connected');
  assert.equal(calls, 1);
  stop();
});

test('call disposal removes media listeners and prevents late timing messages', () => {
  const pc = connection();
  let calls = 0;
  const stop = watchMediaConnected(pc, () => {
    calls += 1;
  });
  stop();
  assert.equal(pc.listenerCount, 0);
  pc.change('connected');
  assert.equal(calls, 0);
});

test('an already connected peer is reported immediately without keeping a listener', () => {
  const pc = connection();
  pc.connectionState = 'connected';
  let calls = 0;
  watchMediaConnected(pc, () => {
    calls += 1;
  });
  assert.equal(calls, 1);
  assert.equal(pc.listenerCount, 0);
});

test('LiveKit signal sockets are recognised (#161)', () => {
  assert.equal(isLivekitSignalUrl('wss://sfu.example.org/rtc?access_token=x'), true);
  assert.equal(isLivekitSignalUrl('wss://sfu.example.org/livekit/sfu/rtc/v1?access_token=x'), true);
  assert.equal(isLivekitSignalUrl('wss://sfu.example.org/rtc/validate'), false);
  assert.equal(isLivekitSignalUrl('https://sfu.example.org/rtc'), false);
  assert.equal(isLivekitSignalUrl('wss://matrix.example.org/_matrix/client/v3/sync'), false);
  assert.equal(isLivekitSignalUrl('nope'), false);
});

test('each LiveKit signal attempt is logged: open, or closed before open', () => {
  class FakeSocket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
    }
  }
  const win = { WebSocket: FakeSocket };
  const lines = [];
  let t = 0;
  watchLivekitSignal(win, (l) => lines.push(l), () => t);
  const first = new win.WebSocket('wss://sfu.example.org/rtc?access_token=a');
  t = 5000;
  const closed = new Event('close');
  closed.code = 1006;
  first.dispatchEvent(closed);
  const second = new win.WebSocket('wss://sfu.example.org/rtc?access_token=a');
  t = 5300;
  second.dispatchEvent(new Event('open'));
  const other = new win.WebSocket('wss://matrix.example.org/other');
  other.dispatchEvent(new Event('open'));
  assert.deepEqual(lines, [
    'call join: LiveKit signal 1 closed before open after 5000 ms (code 1006)',
    'call join: LiveKit signal 2 open after 300 ms',
  ]);
  assert.ok(second instanceof FakeSocket);
  const wrapped = win.WebSocket;
  watchLivekitSignal(win, () => {}, () => 0);
  assert.equal(win.WebSocket, wrapped, 'installed once');
});
