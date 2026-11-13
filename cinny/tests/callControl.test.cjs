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

function setup({ missing = false, disabled = false, contentWindow = true, call = {} } = {}) {
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
    './CallControlState': {},
    '../diagnostics': { diag: (message) => diagnostics.push(message) },
    './audioDevices': { subscribeAudioPrefs: () => () => {}, applyAudioOutput() {} },
    './screenShareAudio': { screenShareAudio: {} },
    './types': { ElementWidgetActions: { DeviceMute: 'io.element.device_mute' } },
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
    control: new exports.CallControl({}, call, iframe),
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
