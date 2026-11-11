// Pure resolution diagnosis (issue #11: logs showed 640x360 sent where 1080p was requested)
// and the shared getStats() of the call's connections (#144).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/streamStats.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const exported = {};
vm.runInNewContext(
  output,
  {
    exports: exported,
    WeakMap,
    setTimeout,
    clearTimeout,
    Promise,
    window: { setInterval: () => 1, clearInterval: () => {} },
    require: (id) => {
      if (id !== '../diagnostics') throw new Error(`Unexpected dependency: ${id}`);
      return { diag: () => {} };
    },
  },
  { filename }
);

test('a sent size at capture size counts as healthy', () => {
  const verdict = exported.resolutionDiagnosis(
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080, qualityLimitationReason: 'none' }
  );
  assert.match(verdict, /sent matches capture 1920x1080/);
});

test('a smaller sent frame blames the reason the encoder itself reports', () => {
  const bandwidth = exported.resolutionDiagnosis(
    { width: 1920, height: 1080 },
    { width: 640, height: 360, qualityLimitationReason: 'bandwidth', targetBitrateKbps: 600 }
  );
  assert.match(bandwidth, /sent 640x360 stays below capture 1920x1080/);
  assert.match(bandwidth, /Bandbreite/);
  const cpu = exported.resolutionDiagnosis(
    { width: 1920, height: 1080 },
    { width: 640, height: 360, qualityLimitationReason: 'CPU' }
  );
  assert.match(cpu, /Encoder-CPU/);
  const silent = exported.resolutionDiagnosis(
    { width: 1920, height: 1080 },
    { width: 640, height: 360, qualityLimitationReason: 'none' }
  );
  assert.match(silent, /zwischen Capture und Sender/);
});

test('missing numbers produce no verdict instead of a wrong one', () => {
  assert.equal(exported.resolutionDiagnosis({}, { width: 640, height: 360 }), null);
  assert.equal(exported.resolutionDiagnosis({ width: 1920, height: 1080 }, {}), null);
});

// Viewer side: the received picture against the tile it is shown in.
test('a lower simulcast layer in a small tile is reported as fitting, not as a fault', () => {
  // 1080p share, half layer (960x540) in an 800x450 tile on a 1x display
  const fits = exported.receiveDiagnosis({
    width: 960,
    height: 540,
    frameRate: 30,
    tileWidth: 800,
    tileHeight: 450,
    pixelRatio: 1,
  });
  assert.equal(fits.key, '960x540|sharp');
  assert.match(fits.text, /received 960x540@30fps fits its tile 800x450@1x shows 800x450 px/);
});

test('a picture smaller than what its tile displays is reported as upscaled', () => {
  const blurry = exported.receiveDiagnosis({
    width: 640,
    height: 360,
    tileWidth: 1280,
    tileHeight: 720,
    pixelRatio: 2,
  });
  assert.equal(blurry.key, '640x360|upscaled');
  assert.match(blurry.text, /shows 2560x1440 px/);
});

test('letterboxing uses the fitted size, and the key ignores the tile size', () => {
  // a 16:9 picture in a square tile is limited by the tile width
  const a = exported.receiveDiagnosis({
    width: 1920,
    height: 1080,
    tileWidth: 1000,
    tileHeight: 1000,
  });
  const b = exported.receiveDiagnosis({
    width: 1920,
    height: 1080,
    tileWidth: 1200,
    tileHeight: 900,
  });
  assert.match(a.text, /shows 1000x563 px/);
  assert.equal(a.key, b.key);
});

test('a video that is not on screen or has no size yet is handled', () => {
  assert.equal(exported.receiveDiagnosis({ width: 1920, height: 1080 }).key, '1920x1080|hidden');
  assert.equal(exported.receiveDiagnosis({ tileWidth: 100, tileHeight: 100 }), null);
});

test('the receive watch is idempotent per window and does nothing without one', () => {
  const win = {};
  const stop = exported.startVideoReceiveWatch(win);
  assert.equal(exported.startVideoReceiveWatch(win), stop);
  stop();
  assert.notEqual(exported.startVideoReceiveWatch(win), stop);
  assert.doesNotThrow(() => exported.startVideoReceiveWatch(null)());
});

// Issue #74: received audio stuck near full scale (undecrypted frames decoded as noise).
test('interval RMS follows totalAudioEnergy over totalSamplesDuration', () => {
  // speech-like: level ~0.1 for 5 s -> energy 0.01 * 5
  const speech = exported.intervalRms({ energy: 1, duration: 10 }, { energy: 1.05, duration: 15 });
  assert.ok(Math.abs(speech - 0.1) < 1e-9);
  assert.ok(speech < exported.LOUD_RECEIVE_RMS);
  // noise-like: level ~0.8 for 5 s
  const noise = exported.intervalRms({ energy: 0, duration: 0 }, { energy: 3.2, duration: 5 });
  assert.ok(Math.abs(noise - 0.8) < 1e-9);
  assert.ok(noise >= exported.LOUD_RECEIVE_RMS);
});

test('short intervals and restarted counters give no level', () => {
  assert.equal(exported.intervalRms({ energy: 0, duration: 0 }, { energy: 1, duration: 0.5 }), undefined);
  assert.equal(exported.intervalRms({ energy: 5, duration: 10 }, { energy: 1, duration: 20 }), undefined);
  assert.equal(exported.intervalRms({ energy: 5, duration: 10 }, { energy: 6, duration: 2 }), undefined);
});

test('pruneConnections drops closed connections and caps the list, oldest first', () => {
  const list = [
    { id: 1, connectionState: 'closed' },
    { id: 2, connectionState: 'connected' },
    { id: 3, connectionState: 'connected' },
    { id: 4, connectionState: 'connected' },
  ];
  exported.pruneConnections(list, 2);
  assert.deepEqual(list.map((p) => p.id), [3, 4]);
});

test('forgetClosed drops only the closed connections and reports each one (#144)', () => {
  const a = { connectionState: 'connected' };
  const b = { connectionState: 'closed' };
  const c = { connectionState: 'failed' };
  const d = { connectionState: 'closed' };
  const set = new Set([a, b, c, d]);
  const forgotten = [];
  exported.forgetClosed(set, (item) => forgotten.push(item));
  assert.deepEqual([...set], [a, c]);
  assert.deepEqual(forgotten, [b, d]);
});

test('withTimeout rejects a promise that never settles and passes through fast ones', async () => {
  await assert.rejects(exported.withTimeout(new Promise(() => {}), 10), /timeout/);
  assert.equal(await exported.withTimeout(Promise.resolve(7), 1000), 7);
});

// #144: every poller shares one getStats() per connection; a slow one is never repeated on top.
const fakePc = () => {
  const pc = { calls: 0, pending: [] };
  pc.getStats = () => {
    pc.calls += 1;
    return new Promise((resolve, reject) => {
      pc.pending.push({ resolve, reject });
    });
  };
  return pc;
};

test('callers within the share window get one report from one getStats()', async () => {
  const pc = fakePc();
  const a = exported.sharedStats(pc, 1000);
  const b = exported.sharedStats(pc, 1500);
  pc.pending[0].resolve('report');
  assert.equal(await a, 'report');
  assert.equal(await b, 'report');
  assert.equal(await exported.sharedStats(pc, 1000 + exported.STATS_SHARE_MS - 1), 'report');
  assert.equal(pc.calls, 1);
  // older than the share window: asked again
  const c = exported.sharedStats(pc, 1000 + exported.STATS_SHARE_MS);
  assert.equal(pc.calls, 2);
  pc.pending[1].resolve('newer');
  assert.equal(await c, 'newer');
});

test('a getStats() that hangs times out for callers and is not asked again', async () => {
  const pc = fakePc();
  await assert.rejects(exported.sharedStats(pc, 0, 5), /timeout/);
  await assert.rejects(exported.sharedStats(pc, 60000, 5), /timeout/);
  assert.equal(pc.calls, 1);
  // once it finally answers, the next poll asks for a fresh report
  pc.pending[0].resolve('late');
  await new Promise((r) => {
    setTimeout(r, 0);
  });
  const next = exported.sharedStats(pc, 120000, 5);
  assert.equal(pc.calls, 2);
  pc.pending[1].resolve('fresh');
  assert.equal(await next, 'fresh');
});

test('a failed report is not shared', async () => {
  const pc = fakePc();
  const first = exported.sharedStats(pc, 0);
  pc.pending[0].reject(new Error('closed'));
  await assert.rejects(first, /closed/);
  const second = exported.sharedStats(pc, 1);
  assert.equal(pc.calls, 2);
  pc.pending[1].resolve('ok');
  assert.equal(await second, 'ok');
});
