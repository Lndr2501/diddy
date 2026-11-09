// Run on the Mac: node --test --test-concurrency=1 tests/*.test.cjs
// All media APIs are mocked; these tests never request microphone/screen access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/screenShareAudio.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.readyState = 'live'; }
  stop() { this.readyState = 'ended'; } // Native stop() does NOT dispatch "ended".
  getSettings() { return { width: 1920, height: 1080, frameRate: 30 }; }
  applyConstraints(constraints) { this.appliedConstraints = constraints; return Promise.resolve(); }
}
class Stream {
  constructor() { this.video = new Track('video'); this.audio = []; }
  getVideoTracks() { return [this.video]; }
  getAudioTracks() { return this.audio; }
  getTracks() { return [this.video, ...this.audio]; }
  addTrack(track) { this.audio.push(track); }
}

function setup({ bridge = true, worklet, native } = {}) {
  const calls = [], contexts = [], sockets = [], diagnostics = [], timers = new Map();
  const acquisitions = [];
  let timerId = 0, statsStopped = 0, nodes = 0;
  const window = {
    ...(native ? { __DIDDY_SYS_AUDIO__: native } : {}),
    ...(!native && bridge ? { __CINNY_SYS_AUDIO__: { port: 1, token: 'mock-fixture' } } : {}),
    setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  };
  const navigator = {
    userActivation: { isActive: true },
    mediaDevices: {
      getDisplayMedia: (constraints) => {
        calls.push('native');
        const capture = deferred();
        capture.constraints = constraints;
        acquisitions.push(capture);
        return capture.promise;
      },
    },
  };
  class AudioContext {
    constructor() {
      calls.push('audio'); contexts.push(this); this.closed = false; this.destinations = [];
      this.audioWorklet = { addModule: () => worklet?.promise ?? Promise.resolve() };
    }
    resume() { return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createMediaStreamDestination() {
      const track = new Track('audio');
      this.destinations.push(track);
      return { stream: { getAudioTracks: () => [track] } };
    }
  }
  class WebSocket {
    constructor() { sockets.push(this); this.closed = false; }
    close() { this.closed = true; }
    format() { this.onmessage?.({ data: JSON.stringify({ type: 'format' }) }); }
  }
  const exports = {};
  const mocks = {
    react: {},
    '../diagnostics': { diag: (line) => diagnostics.push(line) },
    './codecPreference': { capShareConstraints: (o) => o },
    './streamStats': {
      trackPeerConnections() {},
      startStatsLogging: () => () => { statsStopped += 1; },
    },
  };
  vm.runInNewContext(compiled, {
    exports, window, AudioContext, WebSocket, DOMException, Error, Blob,
    AudioWorkletNode: class {
      constructor() { nodes += 1; this.port = { postMessage() {} }; }
      connect() {}
      disconnect() {}
    },
    URL: { createObjectURL: () => 'blob:mock-worklet', revokeObjectURL() {} },
    localStorage: { getItem: () => null, setItem() {} },
    require: (id) => { if (!(id in mocks)) throw new Error(id); return mocks[id]; },
  }, { filename });
  const win = { navigator, document: { hasFocus: () => true } };
  exports.installScreenShareAudio(win);
  return {
    ...exports, calls, contexts, sockets, diagnostics, timers, acquisitions,
    capture: (options = { video: true, audio: true }) => navigator.mediaDevices.getDisplayMedia(options),
    statsStopped: () => statsStopped,
    nodes: () => nodes,
    async complete(promise, stream = new Stream()) {
      acquisitions.at(-1).resolve(stream);
      await flush();
      sockets.at(-1)?.format();
      return promise;
    },
  };
}

test('native capture is invoked synchronously before optional audio; overlapping starts are rejected', async () => {
  const env = setup();
  const first = env.capture();
  assert.deepEqual(env.calls, ['native', 'audio']);
  await assert.rejects(env.capture(), { name: 'InvalidStateError' });
  assert.equal(env.acquisitions.length, 1);
  const stream = await env.complete(first);
  stream.video.stop();
  assert.equal(env.timers.size, 0);
});

test('picker rejection releases audio resources and permits retry', async () => {
  const env = setup();
  const first = env.capture();
  const rejected = assert.rejects(first, { name: 'NotAllowedError' });
  env.acquisitions[0].reject(new DOMException('Canceled by user', 'NotAllowedError'));
  await rejected;
  assert.equal(env.contexts[0].closed, true);
  assert.equal(env.timers.size, 0);
  const stream = await env.complete(env.capture());
  stream.video.stop();
});

test('programmatic video stop cleans up audio and stats once; later natural ended is harmless', async () => {
  const env = setup();
  const stream = await env.complete(env.capture());
  assert.equal(stream.audio.length, 1);
  stream.video.stop();
  stream.video.dispatchEvent(new Event('ended'));
  stream.video.stop();
  assert.equal(env.statsStopped(), 1);
  assert.equal(env.contexts[0].closed, true);
  assert.equal(env.sockets[0].closed, true);
  assert.equal(stream.audio[0].readyState, 'ended');
  assert.equal(env.screenShareAudio.getSnapshot().active, false);
});

test('natural video ending also cleans up the share', async () => {
  const env = setup();
  const stream = await env.complete(env.capture());
  stream.video.readyState = 'ended';
  stream.video.dispatchEvent(new Event('ended'));
  assert.equal(env.statsStopped(), 1);
  assert.equal(env.contexts[0].closed, true);
});

test('ending video during worklet loading settles promptly and never attaches late audio', async () => {
  const worklet = deferred(), env = setup({ worklet });
  const capture = env.capture(), rejected = assert.rejects(capture, { name: 'AbortError' });
  const stream = new Stream();
  env.acquisitions[0].resolve(stream);
  await flush();
  stream.video.stop();
  await rejected;
  assert.equal(env.timers.size, 0);
  worklet.resolve();
  await flush();
  assert.equal(env.nodes(), 0);
  assert.equal(env.sockets.length, 0);
  assert.equal(stream.audio.length, 0);
});

test('canceling a pending handshake immediately settles it and ends its unpublished track', async () => {
  const env = setup();
  const pending = env.screenShareAudio.begin();
  const finished = pending.finish(), rejected = assert.rejects(finished, { name: 'AbortError' });
  await flush();
  assert.equal(env.sockets.length, 1);
  pending.cancel();
  await rejected;
  assert.equal(env.timers.size, 0);
  assert.equal(env.contexts[0].destinations[0].readyState, 'ended');
  assert.equal(env.screenShareAudio.getSnapshot().error, undefined);
});

test('the audio setup timeout covers worklet loading as well as the socket', async () => {
  const env = setup({ worklet: deferred() });
  const finished = env.screenShareAudio.begin().finish();
  const rejected = assert.rejects(finished, /timed out preparing system audio/);
  for (const callback of [...env.timers.values()]) callback();
  await rejected;
  assert.equal(env.contexts[0].closed, true);
  assert.equal(env.timers.size, 0);
});

test('late stopping of an old video cannot end a newer audio session', async () => {
  const env = setup();
  const first = await env.complete(env.capture());
  const second = await env.complete(env.capture());
  first.video.stop();
  assert.equal(env.screenShareAudio.isCurrent(second.audio[0]), true);
  assert.equal(env.contexts[1].closed, false);
  second.video.stop();
});

test('a busy audio bridge falls back to live video and releases audio resources', async () => {
  const env = setup();
  const capture = env.capture(), stream = new Stream();
  env.acquisitions[0].resolve(stream);
  await flush();
  env.sockets[0].onmessage({ data: JSON.stringify({ type: 'error', message: 'busy' }) });
  assert.equal(await capture, stream);
  assert.equal(stream.video.readyState, 'live');
  assert.equal(stream.audio.length, 0);
  assert.equal(env.contexts[0].closed, true);
  stream.video.stop();
});

test('maximum capture dimensions also become ideal dimensions, without mutating the caller', async () => {
  const env = setup();
  const options = Object.freeze({ video: Object.freeze({
    width: Object.freeze({ max: 1920 }), height: Object.freeze({ max: 1080 }), frameRate: 30,
  }), audio: true });
  const capture = env.capture(options);
  const requested = env.acquisitions[0].constraints.video;
  assert.equal(requested.width.ideal, 1920);
  assert.equal(requested.height.ideal, 1080);
  assert.equal(requested.width.max, 1920);
  assert.equal(options.video.width.ideal, undefined);
  const stream = new Stream();
  let settings = { width: 640, height: 360, frameRate: 30 };
  stream.video.getSettings = () => settings;
  stream.video.applyConstraints = async (c) => {
    settings = { width: c.width.ideal, height: c.height.ideal, frameRate: c.frameRate };
  };
  await env.complete(capture, stream);
  assert.equal(stream.video.getSettings().width, 1920);
  assert.equal(stream.video.getSettings().height, 1080);
  stream.video.stop();
  assert.equal(env.timers.size, 0);
});

test('an explicit caller ideal resolution is preserved, not replaced with its maximum', async () => {
  const env = setup();
  const capture = env.capture({ video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 } } });
  assert.equal(env.acquisitions[0].constraints.video.width.ideal, 1280);
  assert.equal(env.acquisitions[0].constraints.video.height.ideal, 720);
  const stream = await env.complete(capture);
  assert.equal(stream.video.appliedConstraints.width.ideal, 1280);
  stream.video.stop();
});

test('failed live-source resolution adjustment does not prevent sharing', async () => {
  const env = setup();
  const capture = env.capture({ video: { width: { max: 1920 }, height: { max: 1080 } } });
  const stream = new Stream();
  stream.video.applyConstraints = () => Promise.reject(new DOMException('Unsupported', 'OverconstrainedError'));
  assert.equal(await env.complete(capture, stream), stream);
  assert.equal(stream.video.readyState, 'live');
  assert.equal(env.diagnostics.some((line) => line.includes('quality adjustment failed')), true);
  stream.video.stop();
});

test('without the desktop bridge, screen capture remains video-only and uses no AudioContext', async () => {
  const env = setup({ bridge: false });
  const stream = await env.complete(env.capture());
  assert.equal(env.contexts.length, 0);
  assert.equal(stream.audio.length, 0);
  stream.video.stop();
});

function nativeBridge() {
  const listeners = new Set(), stopped = [], starts = [];
  return {
    starts, stopped, listeners,
    start() { const d = deferred(); starts.push(d); return d.promise; },
    stop(id) { stopped.push(id); return Promise.resolve(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit(message) { listeners.forEach((listener) => listener(message)); },
  };
}
test('Linux transport attaches a separate audio track and tears down only its own capture', async () => {
  const native = nativeBridge(), env = setup({ native });
  const capture = env.capture(); env.acquisitions[0].resolve(new Stream()); await flush();
  native.starts[0].resolve('linux-1'); const stream = await capture;
  assert.equal(stream.audio.length, 1); assert.equal(env.sockets.length, 0);
  assert.equal(env.screenShareAudio.getSnapshot().active, true);
  stream.video.stop();
  assert.deepEqual(native.stopped, ['linux-1']); assert.equal(native.listeners.size, 0);
});
test('Linux audio error is visible while screen video remains live', async () => {
  const native = nativeBridge(), env = setup({ native });
  const capture = env.capture(); env.acquisitions[0].resolve(new Stream()); await flush();
  native.starts[0].resolve('linux-1'); const stream = await capture;
  native.emit({ id: 'linux-1', error: 'Audio server disconnected' });
  assert.equal(env.screenShareAudio.getSnapshot().error, 'Audio server disconnected');
  assert.equal(env.screenShareAudio.getSnapshot().active, false);
  assert.equal(stream.video.readyState, 'live'); stream.video.stop();
});
test('Linux late native start is stopped after video cancellation', async () => {
  const native = nativeBridge(), env = setup({ native });
  const capture = env.capture(), stream = new Stream();
  env.acquisitions[0].resolve(stream); await flush();
  stream.video.stop(); native.starts[0].resolve('late');
  await assert.rejects(capture, { name: 'AbortError' });
  assert.ok(native.stopped.includes('late')); assert.equal(native.listeners.size, 0);
});
