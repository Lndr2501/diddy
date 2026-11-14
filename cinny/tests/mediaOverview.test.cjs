// Media & Files of a room (#189): which events are pictures, videos or files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/mediaOverview.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const plain = (v) => JSON.parse(JSON.stringify(v));

const ev = (content, extra = {}) => ({
  eventId: '$e1',
  type: 'm.room.message',
  sender: '@a:x',
  ts: 1000,
  content,
  ...extra,
});

test('pictures, videos and files are sorted into their kind', () => {
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.image', body: 'a.png', url: 'mxc://s/a' })).kind, 'pictures');
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.video', body: 'v.mp4', url: 'mxc://s/v' })).kind, 'videos');
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.file', body: 'f.pdf', url: 'mxc://s/f' })).kind, 'files');
});

test('text, audio, stickers, edits, redactions and local echoes are left out', () => {
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.text', body: 'hi' })), undefined);
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.audio', body: 'a', url: 'mxc://s/a' })), undefined);
  assert.equal(mod.mediaItemFromEvent(ev({ body: 's', url: 'mxc://s/s' }, { type: 'm.sticker' })), undefined);
  const img = { msgtype: 'm.image', body: 'a.png', url: 'mxc://s/a' };
  assert.equal(mod.mediaItemFromEvent(ev(img, { relType: 'm.replace' })), undefined);
  assert.equal(mod.mediaItemFromEvent(ev(img, { redacted: true })), undefined);
  assert.equal(mod.mediaItemFromEvent(ev(img, { eventId: '~local' })), undefined);
  assert.equal(mod.mediaItemFromEvent(ev(img, { type: 'm.room.encrypted' })), undefined);
});

test('only mxc media is used', () => {
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.image', body: 'a', url: 'https://evil/x.png' })), undefined);
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.image', body: 'a' })), undefined);
});

test('encrypted media keeps its file, the caption does not become the name', () => {
  const file = { url: 'mxc://s/enc', key: { k: 'x' }, iv: 'iv', hashes: { sha256: 'h' }, v: 'v2' };
  const item = mod.mediaItemFromEvent(
    ev({
      msgtype: 'm.image',
      body: 'look at this',
      filename: 'IMG_1.jpg',
      file,
      info: { mimetype: 'image/jpeg', size: 1234, w: 10, h: 20, thumbnail_file: { ...file, url: 'mxc://s/th' } },
    })
  );
  assert.equal(item.mxc, 'mxc://s/enc');
  assert.equal(item.name, 'IMG_1.jpg');
  assert.deepEqual(plain(item.file), file);
  assert.equal(item.thumbMxc, 'mxc://s/th');
  assert.equal(item.size, 1234);
  assert.equal(item.width, 10);
});

test('broken encrypted files are dropped, odd numbers ignored', () => {
  const bad = { url: 'mxc://s/enc', key: 'nope', iv: 'iv', hashes: {} };
  assert.equal(mod.mediaItemFromEvent(ev({ msgtype: 'm.file', body: 'f', file: bad })), undefined);
  const item = mod.mediaItemFromEvent(ev({ msgtype: 'm.file', body: 'f', url: 'mxc://s/f', info: { size: -1, w: 'x' } }));
  assert.equal(item.size, undefined);
  assert.equal(item.width, undefined);
});

test('merging keeps each event once, newest first', () => {
  const a = mod.mediaItemFromEvent(ev({ msgtype: 'm.image', body: 'a', url: 'mxc://s/a' }, { eventId: '$a', ts: 1 }));
  const b = mod.mediaItemFromEvent(ev({ msgtype: 'm.file', body: 'b', url: 'mxc://s/b' }, { eventId: '$b', ts: 3 }));
  const c = mod.mediaItemFromEvent(ev({ msgtype: 'm.image', body: 'c', url: 'mxc://s/c' }, { eventId: '$c', ts: 2 }));
  const merged = mod.mergeMediaItems([a, b], [c, a]);
  assert.deepEqual(plain(merged.map((i) => i.eventId)), ['$b', '$c', '$a']);
  assert.deepEqual(plain(mod.mediaOfKind(merged, 'pictures').map((i) => i.eventId)), ['$c', '$a']);
});
