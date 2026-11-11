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
const { createJoinTimer, countTiles, isLivekitTokenRequest } = mod;

test('each step is logged once, with the time since the last step and since the start', () => {
  const lines = [];
  let t = 1000;
  const timer = createJoinTimer((l) => lines.push(l), () => t);
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
  const timer = createJoinTimer((l) => lines.push(l), () => t);
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
