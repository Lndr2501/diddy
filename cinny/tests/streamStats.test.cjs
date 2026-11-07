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
    window: {},
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
