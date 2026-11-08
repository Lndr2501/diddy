// Profile effects (#86): validation of what other users send, layer timing, picture sniffing.
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
const { sanitizeProfileEffect, sanitizeProfile } = load('sanitize');
const fx = load('profileEffect');
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const MXC = 'mxc://matrix.tllx.eu/AbCdEf0123456789AbCdEf01';
const layer = (extra = {}) => ({
  mxc: MXC,
  start: 0,
  duration: 2960,
  loop: true,
  loopDelay: 0,
  x: 0,
  y: 0,
  w: 450,
  h: 880,
  z: 100,
  ...extra,
});

test('presets: only ids from the fixed list survive', () => {
  assert.deepEqual(plain(sanitizeProfileEffect({ preset: 'petals' })), { preset: 'petals' });
  assert.equal(sanitizeProfileEffect({ preset: 'evil' }), undefined);
  assert.equal(sanitizeProfileEffect({ preset: 'url(javascript:alert(1))' }), undefined);
  assert.equal(sanitizeProfileEffect({ preset: ['sparkles'] }), undefined);
  assert.equal(sanitizeProfileEffect('sparkles'), undefined);
  assert.equal(sanitizeProfileEffect(null), undefined);
  assert.equal(sanitizeProfileEffect([]), undefined);
});

test('layers: bad urls dropped, at most 4, numbers clamped, layers win over a preset', () => {
  const out = plain(
    sanitizeProfileEffect({
      preset: 'snow',
      name: `  ${'x'.repeat(200)}`,
      stillMxc: 'https://evil.example/still.png',
      previewMxc: MXC,
      layers: [
        { ...layer(), mxc: 'javascript:alert(1)' },
        { ...layer(), mxc: 'mxc://evil/../../x' },
        'not a layer',
        layer({
          start: -5,
          duration: 1,
          loopDelay: 1e12,
          x: 1e9,
          y: -1e9,
          w: Infinity,
          h: 'tall',
          z: NaN,
          loop: 'yes',
          onload: 'alert(1)',
        }),
        layer(),
        layer(),
        layer(),
        layer(),
      ],
    })
  );
  assert.equal(out.preset, undefined);
  assert.equal(out.stillMxc, undefined);
  assert.equal(out.previewMxc, MXC);
  assert.ok(out.name.length > 0 && out.name.length <= 48);
  assert.equal(out.layers.length, 4);
  assert.deepEqual(out.layers[0], {
    mxc: MXC,
    start: 0,
    duration: fx.MIN_EFFECT_DURATION_MS,
    loop: true,
    loopDelay: fx.MAX_EFFECT_LOOP_DELAY_MS,
    x: fx.EFFECT_REF_WIDTH,
    y: -fx.EFFECT_REF_HEIGHT,
    w: 450,
    h: 880,
    z: 0,
  });
  assert.equal(out.layers[0].onload, undefined);
});

test('layers without any valid mxc fall back to the preset or nothing', () => {
  assert.deepEqual(plain(sanitizeProfileEffect({ preset: 'aurora', layers: [{ mxc: 'x' }] })), {
    preset: 'aurora',
  });
  assert.equal(sanitizeProfileEffect({ layers: [{ mxc: 'x' }], stillMxc: MXC }), undefined);
});

test('the profile keeps a valid effect and drops a broken one', () => {
  assert.deepEqual(plain(sanitizeProfile({ v: 1, effect: { preset: 'hearts' } })).effect, {
    preset: 'hearts',
  });
  assert.equal(sanitizeProfile({ v: 1, effect: { preset: 'nope' } }).effect, undefined);
});

test('timing: hidden until start, shown for the duration, paused, then restarted', () => {
  // second layer of a typical pack: starts at 5.92 s, plays 2.88 s, pauses 4.32 s
  const l = fx.clampLayerTiming({ start: 5920, duration: 2880, loop: true, loopDelay: 4320 });
  assert.deepEqual(plain(fx.layerStateAt(l, 0)), { visible: false, cycle: 0, nextChangeIn: 5920 });
  assert.deepEqual(plain(fx.layerStateAt(l, 5920)), {
    visible: true,
    cycle: 0,
    nextChangeIn: 2880,
  });
  assert.deepEqual(plain(fx.layerStateAt(l, 8800)), {
    visible: false,
    cycle: 0,
    nextChangeIn: 4320,
  });
  assert.deepEqual(plain(fx.layerStateAt(l, 13120)), {
    visible: true,
    cycle: 1,
    nextChangeIn: 2880,
  });
});

test('timing: single play goes away, duration 0 never restarts, loops without pause', () => {
  const once = fx.clampLayerTiming({ start: 100, duration: 1000, loop: false });
  assert.equal(fx.layerStateAt(once, 500).visible, true);
  assert.deepEqual(plain(fx.layerStateAt(once, 1100)), {
    visible: false,
    cycle: 0,
    nextChangeIn: null, // Infinity in JSON
  });
  const forever = fx.clampLayerTiming({ start: 0, duration: 0 });
  assert.equal(fx.layerStateAt(forever, 1e9).visible, true);
  assert.equal(fx.layerStateAt(forever, 1e9).nextChangeIn, Infinity);
  const loop = fx.clampLayerTiming({ start: 0, duration: 2960, loopDelay: 0 });
  assert.equal(fx.layerStateAt(loop, 2960).cycle, 1);
  assert.equal(fx.layerStateAt(loop, 2960).visible, true);
});

test('timing: hostile values never make a layer restart faster than the minimum', () => {
  const l = fx.clampLayerTiming({ duration: 0.0001, loopDelay: -10, start: -1 });
  assert.equal(l.duration, fx.MIN_EFFECT_DURATION_MS);
  assert.equal(l.loopDelay, 0);
  assert.equal(l.start, 0);
  for (let t = 0; t < 5000; t += 37) {
    assert.ok(fx.layerStateAt(l, t).nextChangeIn > 0);
  }
  const strings = fx.clampLayerTiming({ duration: '9e9', start: '1', position: 'x' });
  assert.equal(strings.duration, 0);
  assert.equal(strings.start, 0);
  assert.equal(strings.x, 0);
  assert.equal(fx.clampLayerTiming({ duration: 9e9 }).duration, fx.MAX_EFFECT_DURATION_MS);
  assert.deepEqual(plain(fx.clampLayerTiming({ position: { x: 12.4, y: -30 }, zIndex: 101 })), {
    start: 0,
    duration: 0,
    loop: true,
    loopDelay: 0,
    x: 12,
    y: -30,
    w: 450,
    h: 880,
    z: 101,
  });
});

test('resolve: animated layers sorted by z, stills when nothing may move', () => {
  const effect = { layers: [layer({ z: 5 }), layer({ z: 1, mxc: `${MXC}2` })], stillMxc: MXC };
  const moving = fx.resolveProfileEffect(effect, true);
  assert.equal(moving.kind, 'layers');
  assert.deepEqual(plain(moving.layers.map((l) => l.z)), [1, 5]);
  const still = fx.resolveProfileEffect(effect, false);
  assert.equal(still.kind, 'still');
  assert.equal(still.stillMxc, MXC);
  assert.deepEqual(plain(fx.resolveProfileEffect({ preset: 'snow' }, false)), {
    kind: 'preset',
    id: 'snow',
    animate: false,
  });
  assert.equal(fx.resolveProfileEffect(undefined, true), undefined);
});

test('preset particles are deterministic, bounded and only for known presets', () => {
  fx.PROFILE_EFFECT_PRESET_IDS.forEach((id) => {
    const a = fx.presetParticles(id);
    assert.deepEqual(plain(a), plain(fx.presetParticles(id)));
    assert.ok(a.length > 0 && a.length <= 24);
    a.forEach((p) => {
      assert.ok(p.x >= 0 && p.x <= 110, `${id} x ${p.x}`);
      assert.ok(p.delay <= 0 && p.duration > 0);
    });
  });
  assert.deepEqual(plain(fx.presetParticles('evil')), []);
});

// --- picture sniffing -------------------------------------------------------------------------

const { makePng, makeGif, makeWebp } = require('./effectImages.cjs');

const u8 = (b) => new Uint8Array(b.buffer, b.byteOffset, b.length);

test('sniffs APNG, GIF and WebP animations and their play length', () => {
  assert.deepEqual(plain(fx.imageInfo(u8(makePng({ frames: 37, plays: 1, delayMs: 83 })))), {
    type: 'image/png',
    animated: true,
    durationMs: 3071,
    plays: 1,
  });
  assert.deepEqual(plain(fx.imageInfo(u8(makePng()))), {
    type: 'image/png',
    animated: false,
    durationMs: 0,
    plays: 1,
  });
  assert.deepEqual(plain(fx.imageInfo(u8(makeGif({ frames: 3, delayCs: 5 })))), {
    type: 'image/gif',
    animated: true,
    durationMs: 150,
    plays: 0,
  });
  assert.equal(fx.imageInfo(u8(makeGif({ frames: 1 }))).animated, false);
  assert.deepEqual(plain(fx.imageInfo(u8(makeWebp()))), {
    type: 'image/webp',
    animated: true,
    durationMs: 120,
    plays: 0,
  });
});

test('sniffing refuses unknown or broken data without throwing', () => {
  assert.equal(fx.imageInfo(u8(Buffer.from('<svg onload="alert(1)"></svg>'))), undefined);
  assert.equal(fx.imageInfo(u8(Buffer.alloc(3))), undefined);
  const truncated = makePng({ frames: 5 }).subarray(0, 60);
  assert.equal(fx.imageInfo(u8(truncated)).type, 'image/png');
  const huge = makePng();
  huge.writeUInt32BE(0xffffffff, 8); // IHDR length far beyond the data
  assert.equal(fx.imageInfo(u8(huge)).animated, false);
  const gif = makeGif();
  assert.equal(fx.imageInfo(u8(gif.subarray(0, 20))).type, 'image/gif');
});

test('a picture on its own: loops by itself or restarts after each play', () => {
  assert.equal(fx.timingForImage(fx.imageInfo(u8(makeGif()))).duration, 0);
  const once = fx.timingForImage(fx.imageInfo(u8(makePng({ frames: 10, plays: 1, delayMs: 100 }))));
  assert.equal(once.duration, 1000);
  assert.equal(once.loop, true);
  assert.equal(fx.checkEffectLayer(fx.imageInfo(u8(makePng())), 10), undefined);
  assert.match(fx.checkEffectLayer(undefined, 10), /PNG, WebP or GIF/);
  assert.match(
    fx.checkEffectLayer({ type: 'image/jpeg', animated: false, durationMs: 0, plays: 1 }, 10),
    /PNG, WebP or GIF/
  );
  assert.match(fx.checkEffectLayer(fx.imageInfo(u8(makeGif())), 4 * 1024 * 1024), /max 3 MB/);
});
