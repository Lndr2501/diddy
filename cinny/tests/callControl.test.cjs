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

function setup({ missing = false, disabled = false, contentWindow = true } = {}) {
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
    './types': {},
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
    },
    { filename }
  );
  return {
    control: new exports.CallControl({}, {}, iframe),
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
