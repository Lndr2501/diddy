const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual hook, with controlled permission promises and recorder events.
function harness() {
  const state = [];
  const cleanups = [];
  const tracks = [];
  const recorders = [];
  let grant;
  let requests = 0;
  let now = 10000;
  const permission = new Promise((resolve) => {
    grant = resolve;
  });
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      this.state = 'inactive';
      this.mimeType = 'audio/webm;codecs=opus';
      recorders.push(this);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.stopped = true;
    }
  }
  const react = {
    useState(initial) {
      const index = state.length;
      state.push(initial);
      return [
        initial,
        (value) => {
          state[index] = value;
        },
      ];
    },
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    useEffect: (fn) => cleanups.push(fn()),
  };
  const exports = {};
  const filename = path.join(__dirname, '../src/app/hooks/useVoiceRecorder.ts');
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === 'react') return react;
        if (name.endsWith('/nativeMic')) return { nativeMicAvailable: () => false };
        if (name.endsWith('/voiceMessage'))
          return {
            pickRecorderMime: () => 'audio/webm;codecs=opus',
            baseMime: (m) => m.split(';')[0],
            extensionForMime: () => 'webm',
            waveformFromLevels: () => [1024],
            VOICE_MIN_MS: 500,
            VOICE_MAX_MS: 900000,
          };
        throw new Error(name);
      },
      navigator: {
        mediaDevices: {
          getUserMedia: () => {
            requests += 1;
            return permission;
          },
        },
      },
      MediaRecorder: Recorder,
      AudioContext: class {
        createAnalyser() {
          return { fftSize: 1024 };
        }
        createMediaStreamSource() {
          return { connect() {} };
        }
        close() {
          return Promise.resolve();
        }
      },
      window: { clearInterval() {}, setInterval: () => 1 },
      Blob,
      File,
      Date: class extends Date {
        static now() {
          return now;
        }
      },
      Uint8Array,
    }
  );
  return {
    hook: exports.useVoiceRecorder(),
    state,
    recorders,
    advance(ms) {
      now += ms;
    },
    get requests() {
      return requests;
    },
    grant() {
      const track = {
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      tracks.push(track);
      grant({ getTracks: () => [track] });
      return track;
    },
    unmount() {
      cleanups.forEach((fn) => fn?.());
    },
  };
}

test('two starts before a render request only one microphone', async () => {
  const h = harness();
  const first = h.hook.start();
  await h.hook.start();
  assert.equal(h.requests, 1);
  const track = h.grant();
  await first;
  assert.equal(h.recorders.length, 1);
  h.unmount();
  assert.equal(track.stopped, true);
});

for (const action of ['cancel', 'unmount']) {
  test(`permission resolving after ${action} stops the microphone without starting a recorder`, async () => {
    const h = harness();
    const start = h.hook.start();
    if (action === 'cancel') h.hook.cancel();
    else {
      const before = [...h.state];
      h.unmount();
      assert.deepEqual(h.state, before);
    }
    const track = h.grant();
    await start;
    assert.equal(track.stopped, true);
    assert.equal(h.recorders.length, 0);
  });
}

test('cancelling a stopped recorder settles a pending send and detaches late events', async () => {
  const h = harness();
  const start = h.hook.start();
  const track = h.grant();
  await start;
  const result = h.hook.stop();
  assert.equal(h.hook.stop(), result);
  h.hook.cancel();
  assert.equal(await result, undefined);
  assert.equal(track.stopped, true);
  assert.equal(h.recorders[0].onstop, null);
  assert.equal(h.recorders[0].ondataavailable, null);
});

test('recorder errors release the microphone and settle a pending send', async () => {
  const h = harness();
  const start = h.hook.start();
  const track = h.grant();
  await start;
  const result = h.hook.stop();
  h.recorders[0].onerror();
  assert.equal(await result, undefined);
  assert.equal(track.stopped, true);
  assert.equal(h.state[0], 'idle');
  assert.match(h.state[2], /recording failed/);
});

for (const duration of [100, 1200]) {
  test(`stop after ${duration} ms returns only a sufficiently long recording`, async () => {
    const h = harness();
    const start = h.hook.start();
    const track = h.grant();
    await start;
    h.advance(duration);
    const rec = h.recorders[0];
    rec.ondataavailable({ data: new Blob(['audio bytes']) });
    const result = h.hook.stop();
    rec.onstop();
    const recording = await result;
    if (duration < 500) assert.equal(recording, undefined);
    else {
      assert.equal(recording.durationMs, duration);
      assert.equal(recording.file.type, 'audio/webm');
      assert.equal(recording.file.size, 11);
      assert.match(recording.file.name, /\.webm$/);
    }
    assert.equal(track.stopped, true);
    assert.equal(h.state[0], 'idle');
    assert.equal(h.state[2], undefined);
  });
}

for (const duration of [2000, 900000]) {
  test(`spontaneous stop after ${duration} ms reports that the recording was not saved`, async () => {
    const h = harness();
    const start = h.hook.start();
    const track = h.grant();
    await start;
    h.advance(duration);
    h.recorders[0].state = 'inactive';
    h.recorders[0].onstop();
    assert.equal(track.stopped, true);
    assert.equal(h.state[0], 'idle');
    assert.match(h.state[2], /not saved/);
    if (duration === 900000) assert.match(h.state[2], /15-minute limit/);
  });
}
