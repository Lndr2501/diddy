// Nameplates (#78): validation of what other users send and what a row draws from it.
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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const mod = {};
  cache[name] = mod;
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    console,
    require: (id) => load(id.replace('./', '')),
  });
  return mod;
};
const { sanitizeNameplate, sanitizeProfile } = load('sanitize');
const np = load('nameplate');
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const MXC = 'mxc://matrix.tllx.eu/AbCdEf0123456789AbCdEf01';
const VID = 'mxc://matrix.tllx.eu/Video0123456789';

test('a full nameplate survives sanitising unchanged', () => {
  const raw = {
    color: '#7AA2F7',
    preset: 'aurora',
    flow: true,
    imageMxc: MXC,
    videoMxc: VID,
    imagePos: { x: 80, y: 40, zoom: 1.5 },
    fit: 'full',
  };
  assert.deepEqual(plain(sanitizeNameplate(raw)), { ...raw, color: '#7aa2f7' });
});

test('hostile nameplate values are dropped', () => {
  const out = plain(
    sanitizeNameplate({
      color: 'red; background: url(https://evil.example/x)',
      preset: 'url(https://evil.example/x)',
      flow: 'yes',
      imageMxc: 'https://evil.example/x.gif',
      videoMxc: 'mxc://evil.example/../../etc/passwd',
      imagePos: { x: 'a', y: 1, zoom: 1 },
      fit: 'fixed; top:0',
      extra: '<script>',
    })
  );
  assert.equal(out, undefined);
  // an unknown preset never becomes CSS
  assert.equal(np.presetGradient('nope'), undefined);
  assert.equal(np.presetGradient('__proto__'), undefined);
  assert.equal(sanitizeNameplate('aurora'), undefined);
  assert.equal(sanitizeNameplate(null), undefined);
  assert.equal(sanitizeNameplate([MXC]), undefined);
});

test('flow needs a preset, position needs media, fade is the unstored default', () => {
  assert.equal(sanitizeNameplate({ flow: true, fit: 'full' }), undefined);
  assert.deepEqual(plain(sanitizeNameplate({ color: '#000', flow: true, fit: 'fade' })), {
    color: '#000000',
  });
  assert.deepEqual(
    plain(sanitizeNameplate({ preset: 'gold', imagePos: { x: 1, y: 2, zoom: 1 } })),
    { preset: 'gold' }
  );
  // the position is clamped
  assert.deepEqual(plain(sanitizeNameplate({ videoMxc: VID, imagePos: { x: 500, y: -3, zoom: 9 } })), {
    videoMxc: VID,
    imagePos: { x: 100, y: 0, zoom: 3 },
  });
});

test('the nameplate goes through the profile sanitiser', () => {
  const out = plain(sanitizeProfile({ v: 1, nameplate: { preset: 'ocean', videoMxc: VID } }));
  assert.deepEqual(out.nameplate, { preset: 'ocean', videoMxc: VID });
  assert.equal(plain(sanitizeProfile({ v: 1, nameplate: { preset: 'x' } })).nameplate, undefined);
});

test('presets are unique, have labels and only hex stops', () => {
  const ids = np.NAMEPLATE_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  np.NAMEPLATE_PRESETS.forEach((p) => {
    assert.ok(p.label);
    assert.ok(p.stops.length >= 2);
    p.stops.forEach((s) => assert.match(s, /^#[0-9a-f]{6}$/));
  });
  assert.equal(np.presetGradient('ocean', 90), 'linear-gradient(90deg, #1a2a6c, #2c5fa8, #3ab0d8)');
});

test('resolve: nothing to draw without data', () => {
  assert.equal(np.resolveNameplate(undefined, true), undefined);
  assert.equal(np.resolveNameplate({}, true), undefined);
  assert.equal(np.resolveNameplate({ fit: 'full' }, true), undefined);
});

test('resolve: a preset wins over the colour and flows only when animation is allowed', () => {
  const on = plain(np.resolveNameplate({ preset: 'sunset', color: '#ff0000', flow: true }, true));
  assert.equal(on.background, np.presetGradient('sunset'));
  assert.equal(on.flow, true);
  assert.equal(on.fit, 'fade');
  const off = plain(np.resolveNameplate({ preset: 'sunset', flow: true }, false));
  assert.equal(off.flow, false);
  const color = plain(np.resolveNameplate({ color: '#ff0000', fit: 'full' }, true));
  assert.match(color.background, /#ff0000/);
  assert.equal(color.fit, 'full');
});

test('resolve: GIFs stand still when animation is off', () => {
  assert.deepEqual(plain(np.resolveNameplate({ imageMxc: MXC }, true)).image, {
    mxc: MXC,
    still: false,
  });
  assert.deepEqual(plain(np.resolveNameplate({ imageMxc: MXC }, false)).image, {
    mxc: MXC,
    still: true,
  });
});

test('resolve: a video plays with its poster, or shows only the poster when animation is off', () => {
  const on = plain(np.resolveNameplate({ videoMxc: VID, imageMxc: MXC }, true));
  assert.deepEqual(on.video, { mxc: VID, play: true, posterMxc: MXC });
  assert.equal(on.image, undefined);
  const off = plain(np.resolveNameplate({ videoMxc: VID, imageMxc: MXC }, false));
  assert.equal(off.video, undefined);
  assert.deepEqual(off.image, { mxc: MXC, still: true });
  // without a poster the video stays paused on its first frame
  assert.deepEqual(plain(np.resolveNameplate({ videoMxc: VID }, false)).video, {
    mxc: VID,
    play: false,
  });
});

test('upload check: only pictures and WebM/MP4, within the size limit', () => {
  const MB = 1024 * 1024;
  assert.deepEqual(plain(np.checkNameplateFile({ type: 'image/gif', size: MB })), {
    ok: true,
    kind: 'image',
  });
  assert.deepEqual(plain(np.checkNameplateFile({ type: 'video/webm', size: MB })), {
    ok: true,
    kind: 'video',
  });
  assert.equal(np.checkNameplateFile({ type: 'image/svg+xml', size: MB }).ok, false);
  assert.equal(np.checkNameplateFile({ type: 'video/quicktime', size: MB }).ok, false);
  assert.equal(np.checkNameplateFile({ type: 'text/html', size: 10 }).ok, false);
  assert.equal(np.checkNameplateFile({ type: 'video/mp4', size: 0 }).ok, false);
  assert.equal(np.checkNameplateFile({ type: 'video/mp4', size: 9 * MB }).ok, false);
  // the server limit applies when it is lower
  const small = np.checkNameplateFile({ type: 'video/mp4', size: 3 * MB }, 2 * MB);
  assert.equal(small.ok, false);
  assert.match(small.error, /max 2 MB/);
  // a bigger server limit does not lift ours
  assert.equal(np.checkNameplateFile({ type: 'video/mp4', size: 9 * MB }, 100 * MB).ok, false);
});

test('upload check: videos must be short loops', () => {
  assert.equal(np.checkNameplateVideoDuration(4), undefined);
  assert.equal(np.checkNameplateVideoDuration(15), undefined);
  assert.match(np.checkNameplateVideoDuration(16), /too long/);
  assert.ok(np.checkNameplateVideoDuration(NaN));
  assert.ok(np.checkNameplateVideoDuration(Infinity));
  assert.ok(np.checkNameplateVideoDuration(0));
});
