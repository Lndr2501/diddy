const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/CallControl.ts');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2016,
    esModuleInterop: true,
  },
}).outputText;

const guardSource = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/deafenGuard.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 } }
).outputText;
const deafenGuard = {};
vm.runInNewContext(guardSource, { exports: deafenGuard });

function setup({ missing = false, disabled = false, contentWindow = true, call = {}, state = {}, ptt = false } = {}) {
  const calls = [];
  const diagnostics = [];
  let focused = false;
  const button = {
    disabled,
    getAttribute: () => 'secondary',
    click: () => {
      if (!disabled) calls.push('click');
    },
  };
  const document = {
    querySelector: () => (missing ? null : button),
    querySelectorAll: () => [],
    hasFocus: () => focused,
  };
  const iframe = {
    contentDocument: document,
    focus: () => {
      calls.push('iframe.focus');
      focused = true;
    },
    contentWindow: contentWindow
      ? {
          document,
          focus: () => {
            calls.push('window.focus');
            focused = true;
          },
        }
      : null,
  };
  const mocks = {
    './callSounds': { playCallSound() {} },
    'matrix-widget-api': {},
    events: require('node:events'),
    './CallControlState': {
      CallControlState: class {
        constructor(microphone, video, sound, screenshare, spotlight) {
          Object.assign(this, { microphone, video, sound, screenshare, spotlight });
        }
      },
    },
    '../../state/pushToTalk': { isPushToTalkMode: () => ptt },
    '../diagnostics': { diag: (message) => diagnostics.push(message) },
    './audioDevices': { subscribeAudioPrefs: () => () => {}, applyAudioOutput() {} },
    './screenShareAudio': { screenShareAudio: {} },
    './types': { ElementWidgetActions: { DeviceMute: 'io.element.device_mute' } },
    './deafenGuard': deafenGuard,
  };
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      require: (id) => {
        if (!(id in mocks)) throw new Error(`Unexpected import: ${id}`);
        return mocks[id];
      },
      MutationObserver: class {
        observe() {}
        disconnect() {}
      },
      window: { setTimeout: (fn) => setTimeout(fn, 0), clearTimeout },
    },
    { filename }
  );
  return {
    control: new exports.CallControl(state, call, iframe),
    calls,
    diagnostics,
  };
}

test('screen sharing focuses the call synchronously before forwarding the click', () => {
  const { control, calls, diagnostics } = setup();
  control.toggleScreenshare();
  assert.deepEqual(calls, ['iframe.focus', 'window.focus', 'click']);
  assert.match(diagnostics[0], /focus=true/);
});

test('a missing screen-share button is logged without focusing or clicking', () => {
  const { control, calls, diagnostics } = setup({ missing: true });
  control.toggleScreenshare();
  assert.deepEqual(calls, []);
  assert.match(diagnostics[0], /button=MISSING/);
});

test('a disabled screen-share button does not steal focus or start capture', () => {
  const { control, calls } = setup({ disabled: true });
  control.toggleScreenshare();
  assert.deepEqual(calls, []);
});

test('the iframe element is focused even without an available contentWindow', () => {
  const { control, calls } = setup({ contentWindow: false });
  control.toggleScreenshare();
  assert.deepEqual(calls, ['iframe.focus', 'click']);
});

// #161: the call page sometimes does not answer a mute request in time (busy while joining, or the
// call just ended). That used to surface as "js unhandled rejection: Request timed out".
const rejectingCall = (sent, message = 'Request timed out') => ({
  transport: {
    send: async (action, data) => {
      sent.push([action, data]);
      throw new Error(message);
    },
  },
});

test('a mute request the call page does not answer resolves false and is logged', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  const sent = [];
  const { control, diagnostics } = setup({ call: rejectingCall(sent) });
  control.toggleMicrophone(true); // fire and forget, like the mute key and the agent voice
  assert.equal(await control.toggleVideo(), false);
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
  process.off('unhandledRejection', onUnhandled);
  assert.deepEqual(unhandled, []);
  assert.equal(sent.length, 2);
  assert.ok(
    diagnostics.some((d) =>
      /not acknowledged by the call page \(Error: Request timed out\)/.test(d)
    )
  );
});

test('the join state is sent once more when the call page did not answer', async () => {
  const sent = [];
  const { control } = setup({ call: rejectingCall(sent) });
  await control.applyState();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1]);
});

test('an answered mute request resolves true without a second send', async () => {
  const sent = [];
  const call = {
    transport: {
      send: async (action, data) => {
        sent.push([action, data]);
        return {};
      },
    },
  };
  const { control } = setup({ call });
  await control.applyState();
  assert.equal(sent.length, 1);
  assert.equal(await control.toggleMicrophone(true), true);
});

test('fully muted: a microphone the call page switched on by itself is muted again (#225)', async () => {
  const sent = [];
  const call = {
    transport: {
      send: async (action, data) => {
        sent.push(data);
        return {};
      },
    },
  };
  const state = { microphone: false, video: false, sound: false, screenshare: false, spotlight: false };
  const { control, diagnostics } = setup({ call, state });
  // Diddy asked for the microphone off (the full mute) ...
  await control.applyState();
  // ... and the page reports it on by itself when a stream starts
  control.onMediaState({ detail: { data: { audio_enabled: true, video_enabled: false } } });
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  assert.equal(control.sound, false, 'still fully muted');
  assert.equal(control.microphone, false, 'microphone still off');
  assert.deepEqual(JSON.parse(JSON.stringify(sent[sent.length - 1])), { audio_enabled: false, video_enabled: false });
  assert.ok(diagnostics.some((d) => /turned the microphone on while fully muted/.test(d)));
});

const recordingCall = (sent) => ({
  transport: {
    send: async (action, data) => {
      sent.push(JSON.parse(JSON.stringify(data)));
      return {};
    },
  },
});

test('push-to-talk asks for an absolute microphone state, also twice in a row', async () => {
  const sent = [];
  const state = { microphone: false, video: false, sound: true, screenshare: false, spotlight: false };
  const { control } = setup({ call: recordingCall(sent), state, ptt: true });
  control.setMicrophone(true);
  control.setMicrophone(false);
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  assert.deepEqual(sent, [
    { audio_enabled: true, video_enabled: false },
    { audio_enabled: false, video_enabled: false },
  ]);
});

test('push-to-talk: full mute while an opening is on its way stays a full mute (#225)', async () => {
  const sent = [];
  const state = { microphone: false, video: false, sound: true, screenshare: false, spotlight: false };
  const { control } = setup({ call: recordingCall(sent), state, ptt: true });
  control.setMicrophone(true); // key pressed, the page has not answered yet
  control.toggleSound(true); // full mute
  control.setMicrophone(false); // PushToTalkSync closes on the full mute
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  // the late answer to the opening
  control.onMediaState({ detail: { data: { audio_enabled: true, video_enabled: false } } });
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  assert.equal(control.sound, false, 'still fully muted');
  assert.deepEqual(sent[sent.length - 1], { audio_enabled: false, video_enabled: false });
});

test('push-to-talk: lifting the full mute does not bring back the microphone from before', async () => {
  const run = async (ptt) => {
    const sent = [];
    const state = { microphone: true, video: false, sound: true, screenshare: false, spotlight: false };
    const { control } = setup({ call: recordingCall(sent), state, ptt });
    control.toggleSound(true); // full mute: microphone off
    control.onMediaState({ detail: { data: { audio_enabled: false, video_enabled: false } } });
    control.toggleSound(true); // lift it
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    return sent.map((s) => s.audio_enabled);
  };
  assert.deepEqual(await run(false), [false, true], 'voice activation restores the microphone');
  assert.deepEqual(await run(true), [false], 'push-to-talk leaves it to the key');
});
