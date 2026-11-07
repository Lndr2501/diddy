// Hardware-free tests; run on the Mac with the other call regression tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/app/plugins/call/sharedAudio.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

function setup() {
  const created = [], diagnostics = [];
  class AudioContext {
    constructor(options) {
      this.options = options;
      this.state = 'running';
      this.sampleRate = 44100;
      this.resumeCalls = 0;
      created.push(this);
    }
    resume() { this.resumeCalls += 1; this.state = 'running'; return Promise.resolve(); }
  }
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, AudioContext,
    require: (id) => {
      if (id !== '../diagnostics') throw new Error(id);
      return { diag: (line) => diagnostics.push(line) };
    },
  }, { filename });
  return { ...exports, created, diagnostics };
}

test('shared audio follows the platform output rate rather than forcing 48 kHz', () => {
  const env = setup(), audio = env.getSharedAudioContext();
  assert.equal(audio.options.sampleRate, undefined);
  assert.equal(audio.options.latencyHint, 'playback');
  assert.equal(audio.sampleRate, 44100);
  assert.match(env.diagnostics[0], /requestedSampleRate=default/);
});

test('repeated use reuses the existing context without reopening an output device', () => {
  const env = setup(), audio = env.getSharedAudioContext();
  assert.equal(env.getSharedAudioContext(), audio);
  assert.equal(env.created.length, 1);
});

test('a suspended or interrupted context is resumed, not recreated', () => {
  for (const state of ['suspended', 'interrupted']) {
    const env = setup(), audio = env.getSharedAudioContext();
    audio.state = state;
    assert.equal(env.getSharedAudioContext(), audio);
    assert.equal(env.created.length, 1);
    assert.equal(audio.resumeCalls, 1);
  }
});

test('a genuinely closed context is recreated on the next use', () => {
  const env = setup(), old = env.getSharedAudioContext();
  old.state = 'closed';
  assert.notEqual(env.getSharedAudioContext(), old);
  assert.equal(env.created.length, 2);
});

test('local sounds follow the chosen output device (Chromium AudioContext.setSinkId)', () => {
  const env = setup(), sinks = [];
  env.setSharedAudioSink('speakers'); // before the context exists: applied on creation
  const ctx = env.getSharedAudioContext();
  ctx.constructor.prototype.setSinkId = function setSinkId(id) { sinks.push(id); return Promise.resolve(); };
  env.getSharedAudioContext();
  env.setSharedAudioSink('headset');
  env.setSharedAudioSink('headset'); // unchanged: not applied twice
  env.setSharedAudioSink('');
  assert.deepEqual(sinks, ['speakers', 'headset', '']);
});

test('without an explicit choice the system default is left alone', () => {
  const env = setup(), sinks = [];
  env.setSharedAudioSink('');
  const ctx = env.getSharedAudioContext();
  ctx.constructor.prototype.setSinkId = function setSinkId(id) { sinks.push(id); return Promise.resolve(); };
  env.getSharedAudioContext();
  assert.deepEqual(sinks, []);
});

test('a refused output device falls back to the system default', async () => {
  const env = setup(), sinks = [];
  const ctx = env.getSharedAudioContext();
  ctx.constructor.prototype.setSinkId = function setSinkId(id) {
    sinks.push(id);
    return id === 'gone' ? Promise.reject(new Error('NotFound')) : Promise.resolve();
  };
  env.setSharedAudioSink('gone');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(sinks, ['gone', '']);
});
