// The call microphone runs in an audio context without output device (Chromium), so it does not
// stop when the speakers go away (Windows: Bluetooth headset switching to hands-free), and a
// watch notices a clock that stops anyway. Hardware-free.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/micAudio.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

const CHROMIUM_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const WEBKIT_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';

function setup({ userAgent = CHROMIUM_WINDOWS, sinkId = true, throws = false } = {}) {
  const created = [];
  const diagnostics = [];
  const shared = { shared: true, state: 'running' };
  class AudioContext {
    constructor(options) {
      if (throws) throw new Error('NotSupportedError');
      this.options = options;
      this.state = 'running';
      this.sampleRate = options?.sampleRate ?? 44100;
      this.sinkId = options?.sinkId;
      this.closed = 0;
      this.resumed = 0;
      created.push(this);
    }

    close() {
      this.closed += 1;
      this.state = 'closed';
      return Promise.resolve();
    }

    resume() {
      this.resumed += 1;
      this.state = 'running';
      return Promise.resolve();
    }
  }
  if (sinkId) AudioContext.prototype.setSinkId = () => Promise.resolve();
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      AudioContext,
      navigator: { userAgent },
      Promise,
      require: (id) => {
        if (id === '../diagnostics') return { diag: (line) => diagnostics.push(line) };
        if (id === './sharedAudio') return { getSharedAudioContext: () => shared };
        throw new Error(id);
      },
    },
    { filename }
  );
  return { ...exports, created, diagnostics, shared };
}

test('Chromium: the microphone gets its own 48 kHz context without an output device', () => {
  const env = setup();
  const ctx = env.getMicAudioContext();
  assert.notEqual(ctx, env.shared);
  assert.equal(ctx.options.sampleRate, 48000);
  assert.deepEqual({ ...ctx.options.sinkId }, { type: 'none' });
  assert.equal(ctx.options.latencyHint, 'interactive');
  assert.match(env.diagnostics[0], /mic AudioContext created sampleRate=48000 sink=none/);
  assert.equal(env.getMicAudioContext(), ctx, 'created once, then reused');
  assert.equal(env.created.length, 1);
});

test('WebKit on the Mac keeps the shared context (no second CoreAudio client)', () => {
  assert.equal(setup({ userAgent: WEBKIT_MAC }).getMicAudioContext().shared, true);
  assert.equal(setup({ userAgent: WEBKIT_MAC }).created.length, 0);
});

test('an engine without output selection keeps the shared context', () => {
  const env = setup({ sinkId: false });
  assert.equal(env.getMicAudioContext(), env.shared);
  assert.equal(env.created.length, 0);
});

test('a context that cannot be created falls back to the shared one', () => {
  const env = setup({ throws: true });
  assert.equal(env.getMicAudioContext(), env.shared);
  assert.match(env.diagnostics[0], /mic AudioContext failed/);
});

test('a suspended mic context is resumed, a discarded one is closed and replaced', () => {
  const env = setup();
  const ctx = env.getMicAudioContext();
  ctx.state = 'suspended';
  assert.equal(env.getMicAudioContext(), ctx);
  assert.equal(ctx.resumed, 1);
  env.discardMicAudioContext(ctx);
  assert.equal(ctx.closed, 1);
  const next = env.getMicAudioContext();
  assert.notEqual(next, ctx);
  assert.equal(env.created.length, 2);
});

test('discarding never closes the shared context or a stranger', () => {
  const env = setup();
  const ctx = env.getMicAudioContext();
  env.discardMicAudioContext(env.shared);
  env.discardMicAudioContext({ close: () => assert.fail('closed a foreign context') });
  assert.equal(env.getMicAudioContext(), ctx);
});

test('the clock watch reports a clock that stands still while the context runs', () => {
  const { ClockWatch, STALL_MS } = setup();
  const watch = new ClockWatch();
  assert.equal(watch.update(0, 10, 'running'), false);
  assert.equal(watch.update(1000, 10, 'running'), false);
  assert.equal(watch.update(2000, 10.01, 'running'), false);
  assert.equal(watch.update(STALL_MS, 10.01, 'running'), true);
});

test('a running clock, also a slow or jittery one, is no stall', () => {
  const { ClockWatch } = setup();
  const watch = new ClockWatch();
  let audio = 0;
  for (let wall = 0; wall <= 20000; wall += 1000) {
    audio += wall % 2000 === 0 ? 0.4 : 1.2; // render quanta arrive in bursts
    assert.equal(watch.update(wall, audio, 'running'), false, `at ${wall} ms`);
  }
});

test('a suspended context or a long gap (sleep, throttled timer) restarts the measurement', () => {
  const { ClockWatch, MAX_CHECK_GAP_MS } = setup();
  const watch = new ClockWatch();
  watch.update(0, 0, 'running');
  assert.equal(watch.update(1000, 0, 'suspended'), false);
  assert.equal(watch.update(2000, 0, 'running'), false);
  assert.equal(watch.update(2000 + MAX_CHECK_GAP_MS + 1, 0.1, 'running'), false, 'woke from sleep');
  assert.equal(watch.update(2000 + MAX_CHECK_GAP_MS + 1001, 0.1, 'running'), false);
});

test('reset forgets the old measurement', () => {
  const { ClockWatch } = setup();
  const watch = new ClockWatch(2000);
  watch.update(0, 0, 'running');
  watch.update(1500, 0, 'running');
  watch.reset();
  assert.equal(watch.update(2500, 0, 'running'), false);
  assert.equal(watch.update(4500, 0, 'running'), true);
});

test('the call mixer and the speaking ring use the mic context, clips cross contexts safely', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, '../src/app/plugins/call', file), 'utf8');
  const soundboard = read('soundboard.ts');
  assert.match(soundboard, /const ctx = getMicAudioContext\(\);/);
  assert.match(soundboard, /if \(mix\.ctx === ctx\) gain\.connect\(mix\.bus\);\s*else this\.playIntoMix\(mix, buffer\);/);
  assert.match(soundboard, /this\.startClockWatch\(\);/);
  assert.match(read('localSpeaking.ts'), /ctx = getMicAudioContext\(\);/);
});
