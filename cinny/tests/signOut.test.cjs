// Logout: a failed server logout must not silently remove the session from this device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/client/signOut.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = {};
vm.runInNewContext(code, { exports: mod, require: () => ({}) });

const run = async (serverLogout, localOnly) => {
  const steps = [];
  let thrown;
  try {
    await mod.signOut(
      async () => {
        steps.push('server');
        await serverLogout();
      },
      async () => {
        steps.push('local');
      },
      localOnly
    );
  } catch (error) {
    thrown = error;
  }
  return { steps, thrown };
};

test('a successful server logout removes the local session afterwards', async () => {
  const { steps, thrown } = await run(async () => undefined);
  assert.equal(thrown, undefined);
  assert.deepEqual(steps, ['server', 'local']);
});

test('a failed server logout keeps the local session and reports the error', async () => {
  const failure = Object.assign(new Error('Failed to fetch'), { errcode: undefined });
  const { steps, thrown } = await run(async () => {
    throw failure;
  });
  assert.equal(thrown, failure);
  assert.deepEqual(steps, ['server']);
});

test('a server error other than an ended session is reported too', async () => {
  const { steps, thrown } = await run(async () => {
    throw Object.assign(new Error('Internal error'), { errcode: 'M_UNKNOWN', httpStatus: 500 });
  });
  assert.equal(thrown.errcode, 'M_UNKNOWN');
  assert.deepEqual(steps, ['server']);
});

test('a session the server already ended counts as logged out', async () => {
  const { steps, thrown } = await run(async () => {
    throw Object.assign(new Error('Invalid access token'), { errcode: 'M_UNKNOWN_TOKEN' });
  });
  assert.equal(thrown, undefined);
  assert.deepEqual(steps, ['server', 'local']);
});

test('remove anyway skips the server', async () => {
  const { steps, thrown } = await run(async () => {
    throw new Error('should not be called');
  }, true);
  assert.equal(thrown, undefined);
  assert.deepEqual(steps, ['local']);
});

test('sessionAlreadyEnded only matches M_UNKNOWN_TOKEN', () => {
  assert.equal(mod.sessionAlreadyEnded({ errcode: 'M_UNKNOWN_TOKEN' }), true);
  assert.equal(mod.sessionAlreadyEnded({ errcode: 'M_FORBIDDEN' }), false);
  assert.equal(mod.sessionAlreadyEnded(new Error('offline')), false);
  assert.equal(mod.sessionAlreadyEnded(null), false);
  assert.equal(mod.sessionAlreadyEnded('M_UNKNOWN_TOKEN'), false);
});
