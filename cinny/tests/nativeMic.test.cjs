// The native microphone track: what it reports, how it ends, and how it falls back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/nativeMic.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

function setup({
  bridge = { port: 4321, token: 'abc' },
  reply = { type: 'format' },
  ctxState = 'running',
  prefs = { input: '', inputLabel: '' },
} = {}) {
  const sockets = [];
  class FakeTrack extends EventTarget {
    constructor() {
      super();
      this.kind = 'audio';
      this.stopped = 0;
    }
    stop() {
      this.stopped += 1;
    }
  }
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.closed = 0;
      sockets.push(this);
      setTimeout(() => {
        const isDevices = new URL(url).searchParams.get('mode') === 'devices';
        const answer = isDevices
          ? { type: 'devices', inputs: ['EarPods-Mikrofon', '', 7, 'MacBook-Mikrofon'] }
          : reply;
        if (answer && this.onmessage) this.onmessage({ data: JSON.stringify(answer) });
      }, 0);
    }
    close() {
      this.closed += 1;
    }
  }
  const track = new FakeTrack();
  const node = {
    connected: 0,
    disconnected: 0,
    port: {
      posted: [],
      postMessage(d) {
        this.posted.push(d);
      },
    },
    connect() {
      this.connected += 1;
    },
    disconnect() {
      this.disconnected += 1;
    },
  };
  const ctx = {
    state: ctxState,
    sampleRate: 44100,
    resume: async () => {},
    audioWorklet: { addModule: async () => {} },
    createMediaStreamDestination: () => ({
      channelCount: 2,
      stream: { getAudioTracks: () => [track] },
    }),
  };
  const window = { __CINNY_SYS_AUDIO__: bridge, setTimeout, clearTimeout };
  const mod = {};
  vm.runInNewContext(
    compiled,
    {
      exports: mod,
      window,
      WebSocket: FakeWebSocket,
      URLSearchParams,
      URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
      Blob: class {
        constructor() {}
      },
      AudioWorkletNode: function () {
        return node;
      },
      Event,
      EventTarget,
      Promise,
      Error,
      Math,
      require: (id) => {
        if (id === '../diagnostics') return { diag() {} };
        if (id === './sharedAudio') return { getSharedAudioContext: () => ctx };
        if (id === './audioDevices') return { getAudioPrefs: () => prefs };
        throw new Error(id);
      },
    },
    { filename }
  );
  return { mod, sockets, track, node };
}

test('the native microphone asks the bridge for the chosen device at the context rate', async () => {
  const s = setup();
  const track = await s.mod.openNativeMic({ deviceId: 'dev-1', label: 'EarPods (USB) + Mic' });
  const url = new URL(s.sockets[0].url);
  assert.equal(url.host, '127.0.0.1:4321');
  assert.equal(url.searchParams.get('token'), 'abc');
  assert.equal(url.searchParams.get('mode'), 'mic');
  assert.equal(url.searchParams.get('rate'), '44100');
  assert.equal(url.searchParams.get('device'), 'EarPods (USB) + Mic');
  assert.equal(s.mod.isNativeMic(track), true);
  assert.equal(track.label, 'EarPods (USB) + Mic');
  const settings = track.getSettings();
  assert.equal(settings.deviceId, 'dev-1');
  assert.equal(settings.echoCancellation, false);
  // reconfiguring is a harmless no-op
  await track.applyConstraints({ echoCancellation: true });
});

test('stopping the track closes the bridge connection once', async () => {
  const s = setup();
  const track = await s.mod.openNativeMic({});
  track.stop();
  track.stop();
  assert.equal(s.sockets[0].closed, 1);
  assert.equal(s.track.stopped, 1);
  assert.equal(s.node.disconnected, 1);
});

test('when the app side ends, the track reports ended', async () => {
  const s = setup();
  const track = await s.mod.openNativeMic({});
  let ended = 0;
  track.addEventListener('ended', () => {
    ended += 1;
  });
  s.sockets[0].onclose();
  assert.equal(ended, 1);
  assert.equal(s.sockets[0].closed, 1);
});

test('errors from the bridge reject so callers can fall back to WebKit', async () => {
  const s = setup({ reply: { type: 'error', message: 'busy' } });
  await assert.rejects(s.mod.openNativeMic({}), /busy/);
  assert.equal(s.sockets[0].closed, 1);
  const none = setup({ bridge: null });
  assert.equal(none.mod.nativeMicAvailable(), false);
  await assert.rejects(none.mod.openNativeMic({}), /unavailable/);
  const suspended = setup({ ctxState: 'suspended' });
  await assert.rejects(suspended.mod.openNativeMic({}), /not running/);
});

test('the label of a chosen microphone is looked up by its WebKit id', async () => {
  const { mod } = setup();
  const devices = {
    enumerateDevices: async () => [
      { kind: 'audiooutput', deviceId: 'a', label: 'Speakers' },
      { kind: 'audioinput', deviceId: 'b', label: 'EarPods' },
    ],
  };
  assert.equal(await mod.microphoneLabel(devices, 'b'), 'EarPods');
  assert.equal(await mod.microphoneLabel(devices, 'missing'), undefined);
  assert.equal(await mod.microphoneLabel(devices, undefined), undefined);
});

test('the chosen microphone is found by its remembered name when WebKit hides ids and names', async () => {
  const hidden = {
    enumerateDevices: async () => [{ kind: 'audioinput', deviceId: '', label: '' }],
  };
  const { mod } = setup({ prefs: { input: 'dev-9', inputLabel: 'Shure MV7' } });
  const picked = await mod.preferredNativeMic(hidden, undefined);
  assert.equal(picked.deviceId, 'dev-9');
  assert.equal(picked.label, 'Shure MV7');
  // nothing chosen: the default input
  const none = setup();
  const dflt = await none.mod.preferredNativeMic(hidden, undefined);
  assert.equal(dflt.deviceId, undefined);
  assert.equal(dflt.label, undefined);
});

test('the native microphone list is read from the bridge and cleaned', async () => {
  const s = setup();
  const names = await s.mod.listNativeInputs();
  assert.deepEqual([...names], ['EarPods-Mikrofon', 'MacBook-Mikrofon']);
  assert.equal(new URL(s.sockets[0].url).searchParams.get('mode'), 'devices');
  assert.equal(s.sockets[0].closed, 1);
  const none = setup({ bridge: null });
  assert.deepEqual([...(await none.mod.listNativeInputs())], []);
});

test('entries of the native list carry their name in the id', async () => {
  const { mod } = setup();
  const devices = { enumerateDevices: async () => [] };
  assert.equal(
    await mod.microphoneLabel(devices, `${mod.NATIVE_DEVICE_PREFIX}Shure MV7`),
    'Shure MV7'
  );
});
