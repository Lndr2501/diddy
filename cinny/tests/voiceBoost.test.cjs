const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { patch } = require('../scripts/patch-element-call.cjs');

function setup() {
  const exports = {};
  const context = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,
    '../src/app/plugins/call/voiceBoost.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports, require: () => ({ getSharedAudioContext: () => context }),
  });
  const win = {};
  let outputVolume = 0.5, deafened = false;
  exports.installVoiceBoost(win, () => ({ outputVolume }), () => deafened);
  const el = { volume: 1, muted: false };
  const track = {
    source: 'microphone', attachedElements: [el],
    setAudioContext(ctx) {
      assert.equal(ctx, context);
      this.audioContext = ctx;
      this.gainNode = { gain: { setTargetAtTime: (value) => { this.gain = value; } } };
    },
  };
  return { ...exports, win, el, track, setOutput: (v) => { outputVolume = v; },
    setDeafened: (v) => { deafened = v; } };
}

test('boost multiplies voice and output, preserves mute/deafen and returns below 100 %', () => {
  const t = setup();
  const set = (v) => t.win.__diddyTrackVolume(t.track, v);
  assert.equal(set(0.8), false); // unboosted audio keeps its original playback path
  assert.equal(set(2), true);
  assert.equal(t.track.gain, 1); // 200 % voice × 50 % output
  assert.equal(t.el.volume, 0); // never play both paths
  assert.equal(t.el.muted, true);
  t.applyBoostOutput(t.el, 0.25, false);
  assert.equal(t.track.gain, 0.5);
  t.setDeafened(true);
  set(2);
  assert.equal(t.track.gain, 0);
  t.setDeafened(false);
  set(0);
  assert.equal(t.track.gain, 0);
  set(2);
  assert.equal(t.track.gain, 1);
  set(0.4);
  assert.equal(t.track.gain, 0.2);
  set(9);
  assert.equal(t.track.gain, 1);
  assert.equal(t.applyBoostOutput({}, 1, false), false);
  t.track.source = 'screen_share_audio';
  assert.equal(set(2), false);
});

test('a replacement attached element inherits the boost without doubling playback', () => {
  const t = setup();
  t.win.__diddyTrackVolume(t.track, 2);
  const replacement = { volume: 1, muted: false };
  t.track.attachedElements = [replacement];
  t.win.__diddyTrackVolume(t.track, 2);
  assert.equal(replacement.volume, 0);
  t.applyBoostOutput(replacement, 0, false);
  assert.equal(t.track.gain, 0);
});

test('the pinned build patch changes only voice slider and adds the audio hook, idempotently', () => {
  const dir = path.join(__dirname, '../node_modules/@element-hq/element-call-embedded/dist/assets');
  const source = fs.readdirSync(dir).filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const result = patch(source);
  assert.equal(patch(result), result);
  assert.ok(result.includes('max:2,step:.01'));
  assert.ok(result.includes('window.__diddyTrackVolume?.(this,e)'));
  assert.ok(result.includes('this.elementVolume!==void 0&&this.setVolume(this.elementVolume),e}detach(e)'));
  assert.throws(() => patch('upstream changed'), /hooks changed/);
  // Execute the shipped patched volume method, including its safe HTML-volume fallback.
  const method = result.match(/setVolume\(e\)\{if\(window\.__diddyTrackVolume[\s\S]*?(?=getVolume\(\))/)[0];
  const scope = { window: {}, uQ: () => false };
  const sink = vm.runInNewContext(`({${method}})`, scope);
  sink.attachedElements = [{ volume: 1 }];
  sink.setVolume(2);
  assert.equal(sink.attachedElements[0].volume, 1);
  const t = setup();
  scope.window = t.win;
  Object.assign(sink, t.track);
  sink.setVolume(2);
  assert.equal(sink.gain, 1);
  assert.equal(t.el.volume, 0);
});


test('muted boost restored before audio attaches stays silent when it attaches', () => {
  const t = setup();
  t.track.attachedElements = [];
  t.win.__diddyTrackVolume(t.track, 2);
  t.win.__diddyTrackVolume(t.track, 0);
  t.track.attachedElements = [t.el];
  t.win.__diddyTrackVolume(t.track, t.track.elementVolume);
  assert.equal(t.track.gain, 0);
  assert.equal(t.el.volume, 0);
  t.win.__diddyTrackVolume(t.track, 2);
  assert.equal(t.track.gain, 1);
});
