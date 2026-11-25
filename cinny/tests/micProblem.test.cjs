// Why the call microphone does not work, shown above the call bar (Windows privacy setting,
// microphone in use, none connected, audio processing stopped). Hardware-free.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/micProblem.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/142.0.0.0';

function setup({ userAgent = WINDOWS, access = 'granted', desktop = true } = {}) {
  const calls = [];
  const diagnostics = [];
  const exports = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      navigator: { userAgent },
      Promise,
      Error,
      require: (id) => {
        if (id === 'react') return { useSyncExternalStore: () => undefined };
        if (id === '../diagnostics') return { diag: (line) => diagnostics.push(line) };
        if (id === '../tauri') {
          return {
            canInvoke: () => desktop,
            invoke: async (cmd) => {
              calls.push(cmd);
              if (cmd === 'microphone_access') {
                if (access instanceof Error) throw access;
                return access;
              }
              return null;
            },
          };
        }
        throw new Error(id);
      },
    },
    { filename }
  );
  return { ...exports, calls, diagnostics };
}

const named = (name) => Object.assign(new Error('x'), { name });

test('getUserMedia errors map to what the user can do about them', () => {
  const { classifyMicError } = setup();
  assert.equal(classifyMicError('NotAllowedError'), 'denied');
  assert.equal(classifyMicError('NotReadableError'), 'busy');
  assert.equal(classifyMicError('AbortError'), 'busy');
  assert.equal(classifyMicError('NotFoundError'), 'missing');
  assert.equal(classifyMicError('OverconstrainedError'), 'missing');
  assert.equal(classifyMicError('TypeError'), undefined);
  assert.equal(classifyMicError(undefined), undefined);
});

test('a microphone blocked by the system wins over any error name', () => {
  const { classifyMicError } = setup();
  assert.equal(classifyMicError('NotReadableError', 'denied'), 'blocked');
  assert.equal(classifyMicError('NotAllowedError', 'restricted'), 'blocked');
  assert.equal(classifyMicError(undefined, 'denied'), 'blocked');
  assert.equal(classifyMicError('NotReadableError', 'granted'), 'busy');
});

test('Windows: a failure asks the system and shows the blocked privacy setting', async () => {
  const env = setup({ access: 'denied' });
  await env.reportMicFailure(named('NotReadableError'));
  assert.equal(env.getMicProblem(), 'blocked');
  assert.deepEqual(env.calls, ['microphone_access']);
  assert.ok(env.diagnostics.some((l) => /microphone failed: NotReadableError system access=denied/.test(l)));
  assert.equal(env.canOpenMicSettings(), true);
  env.openMicSettings();
  assert.deepEqual(env.calls, ['microphone_access', 'open_microphone_settings']);
});

test('Windows: a microphone that opens while the system blocks it is still reported', async () => {
  const env = setup({ access: 'denied' });
  await env.reportMicOpened();
  assert.equal(env.getMicProblem(), 'blocked');
});

test('opening the microphone clears an old problem, but not the processing notice', async () => {
  const env = setup({ access: 'granted' });
  await env.reportMicFailure(named('NotFoundError'));
  assert.equal(env.getMicProblem(), 'missing');
  await env.reportMicOpened();
  assert.equal(env.getMicProblem(), undefined);
  env.reportProcessingStopped();
  await env.reportMicOpened();
  assert.equal(env.getMicProblem(), 'processing');
  env.clearMicProblem();
  assert.equal(env.getMicProblem(), undefined);
});

test('Linux, macOS and the browser never ask the Windows-only command', async () => {
  for (const env of [setup({ userAgent: LINUX }), setup({ desktop: false })]) {
    assert.equal(await env.askMicAccess(), 'unknown');
    await env.reportMicFailure(named('NotReadableError'));
    assert.equal(env.getMicProblem(), 'busy');
    assert.deepEqual(env.calls, []);
    assert.equal(env.canOpenMicSettings(), false);
  }
});

test('an unknown or failing answer of the shell counts as unknown', async () => {
  assert.equal(await setup({ access: 'maybe' }).askMicAccess(), 'unknown');
  assert.equal(await setup({ access: new Error('unknown command') }).askMicAccess(), 'unknown');
});

test('the call bar shows the problem with a way to the Windows settings', () => {
  const bar = fs.readFileSync(
    path.join(__dirname, '../src/app/features/call/CallControls.tsx'),
    'utf8'
  );
  assert.match(bar, /useMicProblem\(\)/);
  assert.match(bar, /onClick=\{openMicSettings\}/);
  const soundboard = fs.readFileSync(
    path.join(__dirname, '../src/app/plugins/call/soundboard.ts'),
    'utf8'
  );
  assert.match(soundboard, /if \(constraints\?\.audio\) reportMicFailure\(e\)/);
  assert.match(soundboard, /clearMicProblem\(\);/);
});
