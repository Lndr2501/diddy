// Hardware-free tests for the voice message rules (format choice, waveform, message fields).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/voiceMessage.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, console }, { filename });
const arr = (x) => [...x];
const plain = (x) => JSON.parse(JSON.stringify(x));

test('the recorder format follows what the engine supports (Safari: MP4, Chromium: Ogg/WebM)', () => {
  assert.equal(
    mod.pickRecorderMime((m) => m === 'audio/mp4'),
    'audio/mp4'
  );
  assert.equal(
    mod.pickRecorderMime((m) => m.startsWith('audio/webm')),
    'audio/webm;codecs=opus'
  );
  assert.equal(
    mod.pickRecorderMime(() => true),
    'audio/ogg;codecs=opus'
  );
  assert.equal(
    mod.pickRecorderMime(() => false),
    undefined
  );
  assert.equal(
    mod.pickRecorderMime(() => {
      throw new Error('boom');
    }),
    undefined
  );
  assert.equal(mod.baseMime('audio/ogg;codecs=opus'), 'audio/ogg');
  assert.equal(mod.extensionForMime('audio/mp4'), 'm4a');
  assert.equal(mod.extensionForMime('audio/webm;codecs=opus'), 'webm');
});

test('the waveform has a fixed number of bins, scaled so that the loudest sample is 1024', () => {
  const levels = Array.from({ length: 300 }, (_, i) => (i % 50) / 100);
  const w = arr(mod.waveformFromLevels(levels));
  assert.equal(w.length, 64);
  assert.equal(Math.max(...w), 1024);
  assert.ok(w.every((v) => Number.isInteger(v) && v >= 0 && v <= 1024));
  assert.deepEqual(arr(mod.waveformFromLevels([0, 0, 0])), Array(64).fill(0));
  assert.deepEqual(arr(mod.waveformFromLevels([])), []);
  // bad values never break it
  assert.equal(arr(mod.waveformFromLevels([NaN, Infinity, -4, 2, 0.5])).length, 64);
});

test('sent voice messages carry the MSC3245 flag and the MSC1767 audio block', () => {
  const fields = plain(mod.voiceContentFields({ durationMs: 12345.6, waveform: [1, 2, 3] }));
  assert.deepEqual(fields['org.matrix.msc3245.voice'], {});
  assert.deepEqual(fields['org.matrix.msc1767.audio'], { duration: 12346, waveform: [1, 2, 3] });
});

test('received voice messages are read defensively', () => {
  assert.equal(mod.readVoice({ msgtype: 'm.audio' }), undefined);
  assert.equal(mod.readVoice(null), undefined);
  const v = plain(
    mod.readVoice({
      'org.matrix.msc3245.voice': {},
      'org.matrix.msc1767.audio': { duration: 4200, waveform: [0, 512, 5000, 'x', NaN, -3] },
    })
  );
  assert.equal(v.durationMs, 4200);
  assert.deepEqual(v.waveform, [0, 512, 1024, 0]);
  // flag without audio block is still a voice message, just without data
  assert.deepEqual(plain(mod.readVoice({ 'org.matrix.msc3245.voice': {} })), { waveform: [] });
  // an oversized waveform is cut
  const big = mod.readVoice({
    'org.matrix.msc3245.voice': {},
    'org.matrix.msc1767.audio': { waveform: Array(5000).fill(10) },
  });
  assert.equal(big.waveform.length, 256);
});

test('bars for drawing are resampled, within 0..1 and never invisible', () => {
  const bars = arr(mod.waveformBars([0, 1024, 512, 0], 8));
  assert.equal(bars.length, 8);
  assert.ok(bars.every((b) => b >= 0.08 && b <= 1));
  assert.equal(arr(mod.waveformBars([], 5)).length, 5);
  assert.deepEqual(arr(mod.waveformBars([1, 2], 0)), []);
});

test('dragging over the waveform maps the pointer to 0..1 and sticks to the ends', () => {
  assert.equal(mod.seekFraction(150, 100, 200), 0.25);
  assert.equal(mod.seekFraction(50, 100, 200), 0);
  assert.equal(mod.seekFraction(400, 100, 200), 1);
  assert.equal(mod.seekFraction(150, 100, 0), 0);
  assert.equal(mod.seekFraction(NaN, 100, 200), 0);
});

test('keys on the waveform seek within the message', () => {
  assert.equal(mod.keySeekTime('ArrowRight', 10, 60), 15);
  assert.equal(mod.keySeekTime('ArrowLeft', 3, 60), 0);
  assert.equal(mod.keySeekTime('ArrowUp', 58, 60), 60);
  assert.equal(mod.keySeekTime('PageUp', 0, 60), 6);
  assert.equal(mod.keySeekTime('Home', 30, 60), 0);
  assert.equal(mod.keySeekTime('End', 30, 60), 60);
  assert.equal(mod.keySeekTime('Enter', 30, 60), undefined);
  assert.equal(mod.keySeekTime('ArrowRight', 0, 0), undefined);
});

test('the speed button steps 1x, 1.5x, 2x and back to 1x (#204)', () => {
  assert.equal(mod.nextVoiceRate(1), 1.5);
  assert.equal(mod.nextVoiceRate(1.5), 2);
  assert.equal(mod.nextVoiceRate(2), 1);
  // unknown speeds start over at the first step after 1x
  assert.equal(mod.nextVoiceRate(3), 1.5);
  assert.deepEqual(arr([1, 1.5, 2].map(mod.voiceRateLabel)), ['1×', '1.5×', '2×']);
});

test('a stored speed is read defensively (#204)', () => {
  assert.equal(mod.parseVoiceRate('1.5'), 1.5);
  assert.equal(mod.parseVoiceRate('2'), 2);
  assert.equal(mod.parseVoiceRate(2), 2);
  assert.equal(mod.parseVoiceRate(null), 1);
  assert.equal(mod.parseVoiceRate('fast'), 1);
  assert.equal(mod.parseVoiceRate('16'), 1);
  assert.equal(mod.parseVoiceRate(''), 1);
});
