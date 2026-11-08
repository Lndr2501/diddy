// Profile frame import (#87): reads the collection layout (konfiguration.json + metadaten.json +
// Ebenen/), maps layers to files by role or id without fetching anything, falls back to
// *top* / *bottom* or one picture, refuses hostile or oversized ZIPs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ts = require('typescript');
const { makePng, makeGif, makeWebp } = require('./effectImages.cjs');

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
const { readProfileFrameZip, readProfileFrameImage, planFrameImport, parseFrameConfig } =
  load('frameZip');
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

const ID_TOP = '1515086535480049714';
const ID_BOTTOM = '1515086540794237099';
const CONFIG = {
  type: 3,
  label: 'Roses on two corners',
  layers: [
    { id: ID_TOP, type: 'staple', order: 'front', anchor: 'top', responsive: false },
    { id: ID_BOTTOM, type: 'staple', order: 'back', anchor: 'bottom', responsive: false },
  ],
  inner_width: 1200,
  overflow_top: 211,
  overflow_bottom: 186,
  overflow_horizontal: 56,
};
const BASE = 'Kollektionen/frames/roses__1/';
const TOP_FILE = `01-ebene-01-front-top-staple__${ID_TOP}.png`;
const BOTTOM_FILE = `02-ebene-02-front-bottom-staple__${ID_BOTTOM}.png`;
const META = {
  name: 'Roses',
  type: 'Profile Frame',
  configuration: CONFIG,
  assets: [
    {
      url: `https://cdn.example.invalid/${ID_TOP}`,
      roles: ['layers[0]'],
      file: `${BASE}Ebenen/${TOP_FILE}`,
    },
    {
      url: `https://cdn.example.invalid/${ID_BOTTOM}`,
      roles: ['layers[1]'],
      file: `${BASE}Ebenen/${BOTTOM_FILE}`,
    },
  ],
};
const collection = ({ meta = META, config = CONFIG, prefix = 'roses__1/' } = {}) =>
  makeZip([
    [`${prefix}konfiguration.json`, Buffer.from(JSON.stringify(config)), 0],
    [`${prefix}metadaten.json`, Buffer.from(JSON.stringify(meta))],
    [`${prefix}Vorschau.png`, makePng()],
    [`${prefix}Ebenen/${TOP_FILE}`, makePng()],
    [`${prefix}Ebenen/${BOTTOM_FILE}`, makePng()],
  ]);

test('config: layers with id / order / anchor and clamped geometry', () => {
  const c = parseFrameConfig(JSON.stringify(CONFIG));
  assert.deepEqual(plain(c), {
    geometry: { innerWidth: 1200, overflowTop: 211, overflowBottom: 186, overflowHorizontal: 56 },
    layers: [
      { id: ID_TOP, order: 'front', anchor: 'top' },
      { id: ID_BOTTOM, order: 'back', anchor: 'bottom' },
    ],
  });
  // the copy nested in the metadata file is read too
  assert.equal(parseFrameConfig(JSON.stringify(META)).layers.length, 2);
  assert.equal(
    parseFrameConfig(JSON.stringify({ frame_data: CONFIG })).geometry.overflowBottom,
    186
  );
  // hostile values
  const bad = parseFrameConfig(
    JSON.stringify({
      layers: [{ id: '../../etc/passwd', order: 'x', anchor: 'y' }, 7, null],
      inner_width: -1,
      overflow_top: 1e12,
    })
  );
  assert.deepEqual(plain(bad.layers), [{ order: 'front', anchor: 'fill' }]);
  assert.equal(bad.geometry.innerWidth, 300);
  assert.equal(bad.geometry.overflowTop, 400);
  assert.equal(parseFrameConfig('{not json'), undefined);
  assert.equal(parseFrameConfig('{"effects": []}'), undefined);
});

test('the collection layout imports both layers with their roles', async () => {
  const frame = await readProfileFrameZip(collection());
  assert.equal(frame.name, 'Roses');
  assert.equal(frame.geometry.overflowTop, 211);
  assert.deepEqual(plain(frame.layers.map((l) => [l.name, l.order, l.anchor, l.type])), [
    [TOP_FILE, 'front', 'top', 'image/png'],
    [BOTTOM_FILE, 'back', 'bottom', 'image/png'],
  ]);
});

test('layers are matched by the id in the file name when the metadata has no roles', () => {
  const names = [
    'x/konfiguration.json',
    'x/Ebenen/b.png',
    `x/Ebenen/zz-${ID_BOTTOM}.png`,
    `x/Ebenen/aa-${ID_TOP}.png`,
    'x/Vorschau.png',
  ];
  const plan = planFrameImport(names, JSON.stringify(CONFIG), undefined, 'x/konfiguration.json');
  assert.deepEqual(plain(plan.layers.map((l) => l.entry)), [
    `x/Ebenen/aa-${ID_TOP}.png`,
    `x/Ebenen/zz-${ID_BOTTOM}.png`,
  ]);
  // without ids the layers take the pictures in order, never the preview
  const noIds = { ...CONFIG, layers: CONFIG.layers.map(({ id, ...rest }) => rest) };
  const byOrder = planFrameImport(
    ['x/konfiguration.json', 'x/Vorschau.png', 'x/Ebenen/02.png', 'x/Ebenen/01.png'],
    JSON.stringify(noIds),
    undefined,
    'x/konfiguration.json'
  );
  assert.deepEqual(plain(byOrder.layers.map((l) => l.entry)), [
    'x/Ebenen/01.png',
    'x/Ebenen/02.png',
  ]);
});

test('fallback without config: a *top* / *bottom* pair, else one picture over the card', async () => {
  const pair = await readProfileFrameZip(
    makeZip([
      ['frame/bottom.png', makePng()],
      ['frame/top.webp', makeWebp({ frames: 1 })],
      ['frame/preview.png', makePng()],
    ])
  );
  assert.deepEqual(plain(pair.layers.map((l) => [l.name, l.anchor])), [
    ['top.webp', 'top'],
    ['bottom.png', 'bottom'],
  ]);
  assert.equal(pair.geometry.innerWidth, 1200);
  const single = await readProfileFrameZip(makeZip([['my-frame.png', makePng()]]));
  assert.deepEqual(plain(single.layers.map((l) => [l.name, l.anchor, l.order])), [
    ['my-frame.png', 'fill', 'front'],
  ]);
  const image = readProfileFrameImage('Gold rim.png', makePng());
  assert.equal(image.name, 'Gold rim');
  assert.equal(image.layers[0].anchor, 'fill');
  assert.throws(() => readProfileFrameImage('a.gif', makeGif()), /PNG or WebP/);
});

test('hostile ZIPs: wrong types, oversized layers, path tricks, empty archives', async () => {
  // a GIF renamed to .png is refused by its bytes
  await assert.rejects(
    readProfileFrameZip(
      makeZip([
        ['top.png', makeGif()],
        ['bottom.png', makePng()],
      ])
    ),
    /PNG or WebP/
  );
  // one layer over 2 MB
  const big = Buffer.concat([makePng(), Buffer.alloc(2 * 1024 * 1024)]);
  await assert.rejects(readProfileFrameZip(makeZip([['frame.png', big]])), /too large/);
  // more than 6 MB in total
  const almost = Buffer.concat([makePng(), Buffer.alloc(1.9 * 1024 * 1024)]);
  const four = {
    ...CONFIG,
    layers: [1, 2, 3, 4].map(() => ({ order: 'front', anchor: 'top' })),
  };
  await assert.rejects(
    readProfileFrameZip(
      makeZip([
        ['konfiguration.json', Buffer.from(JSON.stringify(four))],
        ['Ebenen/1.png', almost],
        ['Ebenen/2.png', almost],
        ['Ebenen/3.png', almost],
        ['Ebenen/4.png', almost],
      ])
    ),
    /in total/
  );
  // `..` and hidden files are never used
  await assert.rejects(
    readProfileFrameZip(
      makeZip([
        ['../evil.png', makePng()],
        ['__MACOSX/top.png', makePng()],
        ['.hidden.png', makePng()],
      ])
    ),
    /no PNG or WebP/
  );
  await assert.rejects(readProfileFrameZip(new ArrayBuffer(10)));
  // at most four layers even when the config lists more
  const many = { ...CONFIG, layers: Array.from({ length: 12 }, () => ({ anchor: 'top' })) };
  const plan = planFrameImport(
    Array.from({ length: 12 }, (_, i) => `Ebenen/${i}.png`),
    JSON.stringify(many)
  );
  assert.equal(plan.layers.length, 4);
});
