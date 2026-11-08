// Profile frames (#87): validation of what other users send and the geometry maths.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dir = path.join(__dirname, '../src/app/plugins/diddy');
const cache = {};
const load = (name) => {
  if (cache[name]) return cache[name];
  const code = ts.transpileModule(fs.readFileSync(path.join(dir, `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = {};
  cache[name] = mod;
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    console,
    Uint8Array,
    DataView,
    require: (id) => load(id.replace('./', '')),
  });
  return mod;
};
const { sanitizeProfileFrame, sanitizeProfile } = load('sanitize');
const fr = load('profileFrame');
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const MXC = 'mxc://matrix.tllx.eu/AbCdEf0123456789AbCdEf01';
const ROSES = {
  inner_width: 1200,
  overflow_top: 211,
  overflow_bottom: 186,
  overflow_horizontal: 56,
};

test('a known preset survives, unknown ones are dropped', () => {
  assert.deepEqual(plain(sanitizeProfileFrame({ preset: 'gold' })), { preset: 'gold' });
  assert.equal(sanitizeProfileFrame({ preset: 'javascript:alert(1)' }), undefined);
  assert.equal(sanitizeProfileFrame({ preset: '__proto__' }), undefined);
  assert.equal(sanitizeProfileFrame('gold'), undefined);
  assert.equal(sanitizeProfileFrame(null), undefined);
  assert.equal(sanitizeProfileFrame([{ preset: 'gold' }]), undefined);
});

test('layers: only mxc urls, at most four, order / anchor from a fixed list', () => {
  const out = sanitizeProfileFrame({
    layers: [
      { mxc: 'https://evil.example/x.png', order: 'front', anchor: 'top' },
      { mxc: MXC, order: 'behind<script>', anchor: 'everywhere' },
      { mxc: MXC, order: 'back', anchor: 'bottom', style: 'position:fixed' },
      'nope',
      { mxc: MXC },
      { mxc: MXC },
      { mxc: MXC },
      { mxc: MXC },
    ],
    name: 'x'.repeat(500),
  });
  assert.equal(out.layers.length, fr.MAX_FRAME_LAYERS);
  assert.deepEqual(plain(out.layers[0]), { mxc: MXC, order: 'front', anchor: 'fill' });
  assert.deepEqual(plain(out.layers[1]), { mxc: MXC, order: 'back', anchor: 'bottom' });
  assert.equal(out.name.length, 48);
  // a layer frame wins over a preset
  assert.equal(sanitizeProfileFrame({ preset: 'gold', layers: [{ mxc: MXC }] }).preset, undefined);
});

test('geometry is clamped against hostile numbers', () => {
  const out = sanitizeProfileFrame({
    layers: [{ mxc: MXC, anchor: 'top' }],
    innerWidth: 1e9,
    overflowTop: -50,
    overflowBottom: Infinity,
    overflowHorizontal: '56',
  });
  assert.equal(out.innerWidth, fr.MAX_FRAME_INNER_WIDTH);
  assert.equal(out.overflowTop, 0);
  assert.equal(out.overflowBottom, 0);
  assert.equal(out.overflowHorizontal, 0);
  const tiny = sanitizeProfileFrame({
    layers: [{ mxc: MXC }],
    innerWidth: 5,
    overflowTop: 9999,
    overflowBottom: NaN,
  });
  assert.equal(tiny.innerWidth, fr.MIN_FRAME_INNER_WIDTH);
  assert.equal(tiny.overflowTop, fr.MAX_FRAME_OVERFLOW);
  assert.equal(tiny.overflowBottom, 0);
  // the pack's snake_case is understood
  assert.deepEqual(plain(fr.clampFrameGeometry(ROSES)), {
    innerWidth: 1200,
    overflowTop: 211,
    overflowBottom: 186,
    overflowHorizontal: 56,
  });
});

test('a profile keeps its sanitised frame and drops a broken one', () => {
  const ok = sanitizeProfile({ v: 1, frame: { preset: 'vines' } });
  assert.deepEqual(plain(ok.frame), { preset: 'vines' });
  const bad = sanitizeProfile({ v: 1, frame: { preset: 'nope', layers: [{ mxc: 'x' }] } });
  assert.equal(bad.frame, undefined);
});

test('resolve: presets bring their geometry, the viewer switch hides frames', () => {
  const p = fr.resolveProfileFrame({ preset: 'gold' });
  assert.equal(p.kind, 'preset');
  assert.equal(p.geometry.innerWidth, 1200);
  assert.equal(fr.resolveProfileFrame({ preset: 'gold' }, false), undefined);
  assert.equal(fr.resolveProfileFrame(undefined), undefined);
  const l = fr.resolveProfileFrame({
    layers: [{ mxc: MXC, order: 'front', anchor: 'top' }],
    ...fr.clampFrameGeometry(ROSES),
  });
  assert.equal(l.kind, 'layers');
  assert.equal(l.geometry.overflowTop, 211);
  // every preset id is listed once
  assert.equal(new Set(fr.PROFILE_FRAME_PRESET_IDS).size, fr.PROFILE_FRAME_PRESETS.length);
});

test('geometry: everything scales with cardWidth / innerWidth', () => {
  const g = fr.clampFrameGeometry(ROSES);
  const big = fr.frameGeometry(g, 600);
  assert.equal(big.scale, 0.5);
  assert.equal(big.top, 105.5);
  assert.equal(big.bottom, 93);
  assert.equal(big.side, 28);
  // a 1312 px wide layer picture becomes card + both overhangs
  assert.equal(big.layerWidth, 656);
  assert.equal(big.layerWidth, 600 + 2 * big.side);
  const small = fr.frameGeometry(g, 340);
  assert.equal(small.side, 15.87);
  assert.equal(small.top, 59.78);
  assert.deepEqual(plain(fr.frameGeometry(g, -5)), {
    scale: 0,
    top: 0,
    bottom: 0,
    side: 0,
    layerWidth: 0,
  });
  assert.deepEqual(plain(fr.frameFactors(g)), { top: 0.1758, bottom: 0.155, side: 0.0467 });
});

test('geometry as CSS: layers hang on their edge, padding keeps room for the overhangs', () => {
  const g = fr.clampFrameGeometry(ROSES);
  assert.deepEqual(plain(fr.frameLayerCss('top', g, '340px')), {
    left: 'calc(340px * -0.0467)',
    right: 'calc(340px * -0.0467)',
    top: 'calc(340px * -0.1758)',
  });
  assert.deepEqual(plain(fr.frameLayerCss('bottom', g, '340px')), {
    left: 'calc(340px * -0.0467)',
    right: 'calc(340px * -0.0467)',
    bottom: 'calc(340px * -0.155)',
  });
  const fill = fr.frameLayerCss('fill', { innerWidth: 1200 }, 'var(--w)');
  assert.deepEqual(plain(fill), { left: '0px', right: '0px', top: '0px', bottom: '0px' });
  assert.equal(fr.frameLayerCss('center', g, '1px').center, true);
  const pad = fr.framePaddingCss(g, '340px');
  assert.equal(pad.top, 'calc(340px * 0.1758)');
  assert.equal(pad.vertical, 'calc(340px * 0.3308)');
  // the card shrinks so card + side overhangs fit into the window
  assert.equal(
    fr.fitCardWidth('600px', '100vw - 32px', g),
    'min(600px, calc((100vw - 32px) / 1.0934))'
  );
  assert.equal(fr.fitCardWidth('600px', '100vw', { innerWidth: 1200 }), 'min(600px, 100vw)');
});

test('layer pictures: PNG / WebP only, at most 2 MB', () => {
  assert.equal(fr.checkFrameLayer('image/png', 1000), undefined);
  assert.equal(fr.checkFrameLayer('image/webp', 1000), undefined);
  assert.match(fr.checkFrameLayer('image/gif', 1000), /PNG or WebP/);
  assert.match(fr.checkFrameLayer(undefined, 1000), /PNG or WebP/);
  assert.match(fr.checkFrameLayer('image/png', 2 * 1024 * 1024 + 1), /too large/);
});
