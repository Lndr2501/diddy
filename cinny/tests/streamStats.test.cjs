// Pure resolution diagnosis (issue #11: logs showed 640x360 sent where 1080p was requested).
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
  const stop = exported.startReceiveWatch(win);
  assert.equal(exported.startReceiveWatch(win), stop);
  stop();
  assert.notEqual(exported.startReceiveWatch(win), stop);
  assert.doesNotThrow(() => exported.startReceiveWatch(null)());
});
