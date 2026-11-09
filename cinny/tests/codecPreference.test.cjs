const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/codecPreference.ts');
const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const m = {};
vm.runInNewContext(out, { exports: m, require: () => ({ diag: () => {} }) }, { filename });

test('H264 moves to the front, rtx/red stay as fallbacks, order is stable', () => {
  const codecs = [
    { mimeType: 'video/VP8' },
    { mimeType: 'video/rtx' },
    { mimeType: 'video/H264', sdpFmtpLine: 'packetization-mode=0;profile-level-id=42e01f' },
    { mimeType: 'video/H264', sdpFmtpLine: 'packetization-mode=1;profile-level-id=42e01f' },
    { mimeType: 'video/VP9' },
  ];
  const r = m.preferCodecs(codecs);
  assert.equal(r[0].sdpFmtpLine, 'packetization-mode=1;profile-level-id=42e01f');
  assert.equal(r[1].mimeType, 'video/H264');
  assert.deepEqual(r.slice(2).map((c) => c.mimeType), ['video/VP8', 'video/rtx', 'video/VP9']);
  assert.equal(r.length, codecs.length);
});

test('without H264 the order is unchanged', () => {
  const codecs = [{ mimeType: 'video/VP8' }, { mimeType: 'video/VP9' }];
  assert.deepEqual(m.preferCodecs(codecs), codecs);
});

test('screen share is capped to 1080p30, smaller requests stay', () => {
  const r = m.capShareConstraints({
    video: { width: { max: 3840, ideal: 3840 }, height: 2160, frameRate: { max: 60 } },
  });
  assert.equal(r.video.width.max, 1920);
  assert.equal(r.video.width.ideal, 1920);
  assert.equal(r.video.height, 1080);
  assert.equal(r.video.frameRate.max, 30);
  const small = m.capShareConstraints({ video: { width: 1280, frameRate: 15 } });
  assert.equal(small.video.width, 1280);
  assert.equal(small.video.frameRate, 15);
  assert.equal(m.capShareConstraints(undefined), undefined);
  assert.deepEqual(m.capShareConstraints({ video: true }), { video: true });
});
