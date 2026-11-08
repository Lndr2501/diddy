// Nameplate ZIP import (#78): picks the best loop, reads the colour, refuses hostile ZIPs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const zlib = require('node:zlib');
const ts = require('typescript');

const file = path.join(__dirname, '../src/app/plugins/diddy/nameplateZip.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(code, {
  exports: mod,
  TextDecoder,
  Blob,
  DecompressionStream,
  Uint8Array,
  DataView,
  JSON,
  Number,
  Object,
  Array,
  Error,
  Math,
  Promise,
});
const { readNameplateZip, colorFromNameplateMetadata } = mod;

// A minimal ZIP writer: entries [name, Buffer, method(0|8)].
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

const META = JSON.stringify({ archive_record: { gradient_colours: '[1513309,1183322]' } });

test('takes the animated picture before the video (WebM alpha is black in WebKit)', async () => {
  const zip = makeZip([
    ['pack/vorschau.png', Buffer.from('png')],
    ['pack/animation-bild.apng', Buffer.from('apng')],
    ['pack/animation-video.webm', Buffer.from('webm-bytes')],
    ['pack/metadaten.json', Buffer.from(META), 0],
  ]);
  const out = await readNameplateZip(zip);
  assert.equal(out.name, 'animation-bild.apng');
  assert.equal(out.type, 'image/png');
  assert.equal(Buffer.from(out.data).toString(), 'apng');
  assert.equal(out.color, '#17175d');
});

test('uses the video when there is no animated picture; then the still', async () => {
  const video = await readNameplateZip(
    makeZip([
      ['a/vorschau.png', Buffer.from('still')],
      ['a/loop.webm', Buffer.from('v')],
    ])
  );
  assert.equal(video.name, 'loop.webm');
  assert.equal(video.type, 'video/webm');
});

test('falls back to the animated, then the still picture; apng is served as png', async () => {
  const out = await readNameplateZip(
    makeZip([
      ['a/vorschau.png', Buffer.from('still')],
      ['a/loop.apng', Buffer.from('loop')],
    ])
  );
  assert.equal(out.name, 'loop.apng');
  assert.equal(out.type, 'image/png');
  assert.equal(out.color, undefined);
});

test('refuses ZIPs without media, with path tricks only, or that are not ZIPs', async () => {
  await assert.rejects(
    readNameplateZip(makeZip([['readme.txt', Buffer.from('x')]])),
    /no video or image/
  );
  await assert.rejects(
    readNameplateZip(
      makeZip([
        ['../evil.webm', Buffer.from('x')],
        ['__MACOSX/a.webm', Buffer.from('x')],
      ])
    ),
    /no video or image/
  );
  await assert.rejects(readNameplateZip(new Uint8Array(100).buffer), /not a ZIP/);
});

test('a file that unpacks larger than allowed is refused while unpacking', async () => {
  const big = Buffer.alloc(17 * 1024 * 1024, 1);
  await assert.rejects(readNameplateZip(makeZip([['loop.webm', big]])), /too large/);
});

test('colour metadata: list or JSON text, numbers or #rrggbb, garbage ignored', () => {
  assert.equal(colorFromNameplateMetadata('{"gradient_colours":[255]}'), '#0000ff');
  assert.equal(colorFromNameplateMetadata('{"gradient_colours":["#AABBCC"]}'), '#aabbcc');
  assert.equal(colorFromNameplateMetadata(META), '#17175d');
  assert.equal(colorFromNameplateMetadata('{"gradient_colours":["red"]}'), undefined);
  assert.equal(colorFromNameplateMetadata('{"gradient_colours":[99999999999]}'), undefined);
  assert.equal(colorFromNameplateMetadata('not json'), undefined);
});
