// Profile effect import (#86): reads the collection layout (konfiguration.json + metadaten.json +
// Phasen/), maps layers to files by role without fetching the config urls, falls back to the best
// animated picture, refuses hostile or oversized ZIPs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ts = require('typescript');
const { makePng, makeGif } = require('./effectImages.cjs');

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
    TextDecoder,
    Blob,
    DecompressionStream,
    Uint8Array,
    DataView,
    Map,
    Set,
    Promise,
    Error,
    // the import must never go to the network
    fetch: () => {
      throw new Error('fetch called');
    },
    require: (id) => load(id.replace('./', '')),
  });
  return mod;
};
const { readProfileEffectZip, readProfileEffectImage, planEffectImport, parseEffectConfig } =
  load('effectZip');
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const makeZip = (entries) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  entries.forEach(([name, data, method = 8]) => {
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  });
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, centralBuf, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
};

const URL_A = 'https://cdn.example.invalid/assets/aaa';
const URL_B = 'https://cdn.example.invalid/assets/bbb';
const CONFIG = {
  title: 'Nova',
  reducedMotionSrc: 'https://cdn.example.invalid/assets/rrr',
  staticFrameSrc: 'https://cdn.example.invalid/assets/sss',
  thumbnailPreviewSrc: 'https://cdn.example.invalid/assets/ppp',
  effects: [
    {
      src: URL_A,
      loop: true,
      width: 450,
      height: 880,
      duration: 2960,
      start: 0,
      loopDelay: 0,
      position: { x: 0, y: 0 },
      zIndex: 100,
    },
    {
      src: URL_B,
      loop: true,
      width: 450,
      height: 880,
      duration: 2880,
      start: 5920,
      loopDelay: 4320,
      position: { x: 4, y: 8 },
      zIndex: 101,
    },
  ],
};
const BASE = 'Kollektionen/galaxy/nova__1/';
const META = {
  name: 'Nova',
  assets: [
    { url: 'x', roles: ['thumbnailPreviewSrc'], file: `${BASE}Phasen/01-vorschau.png` },
    { url: 'x', roles: ['reducedMotionSrc'], file: `${BASE}Phasen/02-reduzierte-bewegung.png` },
    { url: 'x', roles: ['staticFrameSrc'], file: `${BASE}Phasen/03-statisches-bild.png` },
    {
      url: URL_B,
      roles: ['archive.animated_icon', 'effects[1].src'],
      file: `${BASE}Phasen/04-archiv-animation.apng`,
    },
    { url: URL_A, roles: ['effects[0].src'], file: `${BASE}Phasen/05-phase-01-loop.apng` },
  ],
};
const loopA = makePng({ frames: 37, plays: 1, delayMs: 80 });
const loopB = makePng({ frames: 36, plays: 0, delayMs: 83 });
const collection = (meta = META, prefix = 'nova__1/') =>
  makeZip([
    [`${prefix}konfiguration.json`, Buffer.from(JSON.stringify(CONFIG)), 0],
    [`${prefix}metadaten.json`, Buffer.from(JSON.stringify(meta))],
    [`${prefix}Vorschau.png`, makePng()],
    [`${prefix}Phasen/01-vorschau.png`, makePng()],
    [`${prefix}Phasen/02-reduzierte-bewegung.png`, makePng()],
    [`${prefix}Phasen/03-statisches-bild.png`, makePng()],
    [`${prefix}Phasen/04-archiv-animation.apng`, loopB],
    [`${prefix}Phasen/05-phase-01-loop.apng`, loopA],
  ]);

test('collection layout: layers by role with their timing, still and preview', async () => {
  const out = await readProfileEffectZip(collection());
  assert.equal(out.name, 'Nova');
  assert.deepEqual(
    plain(out.layers.map((l) => [l.name, l.type, l.timing.start, l.timing.loopDelay, l.timing.z])),
    [
      ['05-phase-01-loop.apng', 'image/png', 0, 0, 100],
      ['04-archiv-animation.apng', 'image/png', 5920, 4320, 101],
    ]
  );
  assert.deepEqual(plain(out.layers[1].timing), {
    start: 5920,
    duration: 2880,
    loop: true,
    loopDelay: 4320,
    x: 4,
    y: 8,
    w: 450,
    h: 880,
    z: 101,
  });
  assert.equal(Buffer.from(out.layers[0].data).equals(loopA), true);
  assert.equal(out.still.name, '02-reduzierte-bewegung.png');
  assert.equal(out.preview.name, '01-vorschau.png');
});

test('without roles the config urls are matched as text, never fetched', async () => {
  const meta = { assets: META.assets.map(({ roles, ...rest }) => ({ ...rest, roles: [] })) };
  const out = await readProfileEffectZip(collection(meta, ''));
  assert.deepEqual(plain(out.layers.map((l) => l.name)), [
    '05-phase-01-loop.apng',
    '04-archiv-animation.apng',
  ]);
  // still found by its name
  assert.equal(out.still.name, '02-reduzierte-bewegung.png');
});

test('without metadata the layers are taken by order from Phasen/', () => {
  const plan = planEffectImport(
    [
      'fx/konfiguration.json',
      'fx/Vorschau.png',
      'fx/Phasen/01-vorschau.png',
      'fx/Phasen/02-reduzierte-bewegung.png',
      'fx/Phasen/04-b.apng',
      'fx/Phasen/05-a.apng',
      'other/Phasen/00-not-this-effect.apng',
    ],
    JSON.stringify(CONFIG),
    undefined,
    'fx/konfiguration.json'
  );
  assert.deepEqual(plain(plan.layers.map((l) => l.entry)), [
    'fx/Phasen/04-b.apng',
    'fx/Phasen/05-a.apng',
  ]);
  assert.equal(plan.still, 'fx/Phasen/02-reduzierte-bewegung.png');
  assert.equal(plan.preview, 'fx/Vorschau.png');
});

test('config: also nested under configuration, hostile values clamped, at most 16 read', () => {
  const nested = parseEffectConfig(
    JSON.stringify({
      configuration: {
        effects: Array.from({ length: 50 }, () => ({ start: -1, duration: 1e9, zIndex: 'x' })),
      },
    })
  );
  assert.equal(nested.effects.length, 16);
  assert.equal(nested.effects[0].timing.start, 0);
  assert.equal(nested.effects[0].timing.duration, 30000);
  assert.equal(parseEffectConfig('{"effects": 5}'), undefined);
  assert.equal(parseEffectConfig('nope'), undefined);
  // never more than 4 layers
  const many = planEffectImport(
    Array.from({ length: 8 }, (_, i) => `Phasen/${i}-loop.apng`),
    JSON.stringify({ effects: Array.from({ length: 8 }, () => ({ duration: 1000 })) })
  );
  assert.equal(many.layers.length, 4);
});

test('unknown layout: the best animated picture loops on its own', async () => {
  const out = await readProfileEffectZip(
    makeZip([
      ['pack/readme.txt', Buffer.from('hi')],
      ['pack/still.png', makePng()],
      ['pack/sparkle.gif', makeGif({ frames: 4 })],
      ['../evil.apng', loopA],
    ])
  );
  assert.equal(out.layers.length, 1);
  assert.equal(out.layers[0].name, 'sparkle.gif');
  assert.equal(out.layers[0].type, 'image/gif');
  assert.equal(out.layers[0].timing.duration, 0);
  assert.equal(out.still.name, 'still.png');
});

test('refuses ZIPs without an animated picture and pictures in disguise', async () => {
  await assert.rejects(
    readProfileEffectZip(
      makeZip([
        ['a.png', makePng()],
        ['b.txt', Buffer.from('x')],
      ])
    ),
    /no animated/
  );
  await assert.rejects(
    readProfileEffectZip(makeZip([['loop.apng', Buffer.from('<svg onload="alert(1)"/>')]])),
    /no animated/
  );
  await assert.rejects(readProfileEffectZip(new Uint8Array(100).buffer), /not a ZIP/);
});

test('size caps: a layer over 3 MB and an effect over 8 MB are refused', async () => {
  const big = Buffer.concat([makePng({ frames: 2 }), Buffer.alloc(3 * 1024 * 1024)]);
  await assert.rejects(
    readProfileEffectZip(
      makeZip([
        ['konfiguration.json', Buffer.from(JSON.stringify({ effects: [{ duration: 1000 }] }))],
        ['Phasen/loop.apng', big],
      ])
    ),
    /too large \(max 3 MB/
  );
  const almost = Buffer.concat([makePng({ frames: 2 }), Buffer.alloc(2.9 * 1024 * 1024)]);
  await assert.rejects(
    readProfileEffectZip(
      makeZip([
        [
          'konfiguration.json',
          Buffer.from(
            JSON.stringify({ effects: [{ duration: 1 }, { duration: 1 }, { duration: 1 }] })
          ),
        ],
        ['Phasen/1-loop.apng', almost],
        ['Phasen/2-loop.apng', almost],
        ['Phasen/3-loop.apng', almost],
      ])
    ),
    /max 8 MB in total/
  );
});

test('a single picture becomes one looping layer; other files are refused', () => {
  const out = readProfileEffectImage('My Sparkles.gif', new Uint8Array(makeGif()));
  assert.equal(out.name, 'My Sparkles');
  assert.equal(out.layers[0].type, 'image/gif');
  assert.throws(
    () => readProfileEffectImage('x.png', new Uint8Array(Buffer.from('<svg/>'))),
    /PNG, WebP or GIF/
  );
});
