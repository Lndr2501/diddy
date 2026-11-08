const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/components/call-switch/switchCall.ts');
const source = fs.readFileSync(filename, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { module: mod, exports: mod.exports });
const { runCallSwitch } = mod.exports;

function steps(log, overrides = {}) {
  return {
    inCall: true,
    confirm: async () => {
      log.push('confirm');
      return true;
    },
    onConfirmed: () => log.push('confirmed'),
    hangup: async () => {
      log.push('hangup');
    },
    waitUntilLeft: async () => {
      log.push('left');
    },
    start: async () => {
      log.push('start');
    },
    ...overrides,
  };
}

test('not in a call: starts directly without asking', async () => {
  const log = [];
  assert.equal(await runCallSwitch(steps(log, { inCall: false })), true);
  assert.deepEqual(log, ['start']);
});

test('in a call: confirm, hang up, wait until left, then start, in that order', async () => {
  const log = [];
  assert.equal(await runCallSwitch(steps(log)), true);
  assert.deepEqual(log, ['confirm', 'confirmed', 'hangup', 'left', 'start']);
});

test('cancelled: nothing is hung up or started', async () => {
  const log = [];
  const result = await runCallSwitch(
    steps(log, {
      confirm: async () => {
        log.push('confirm');
        return false;
      },
    })
  );
  assert.equal(result, false);
  assert.deepEqual(log, ['confirm']);
});

test('start only runs after the old call is really gone', async () => {
  const log = [];
  let release;
  const gone = new Promise((resolve) => {
    release = resolve;
  });
  const pending = runCallSwitch(
    steps(log, {
      waitUntilLeft: async () => {
        log.push('waiting');
        await gone;
        log.push('left');
      },
    })
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(log, ['confirm', 'confirmed', 'hangup', 'waiting']);
  release();
  assert.equal(await pending, true);
  assert.deepEqual(log.slice(-2), ['left', 'start']);
});

test('a failing hangup does not stop the switch', async () => {
  const log = [];
  const result = await runCallSwitch(
    steps(log, {
      hangup: async () => {
        throw new Error('widget gone');
      },
    })
  );
  assert.equal(result, true);
  assert.deepEqual(log, ['confirm', 'confirmed', 'left', 'start']);
});

test('if leaving fails the new call is not started and the error surfaces', async () => {
  const log = [];
  await assert.rejects(
    runCallSwitch(
      steps(log, {
        waitUntilLeft: async () => {
          throw new Error('stuck');
        },
      })
    ),
    /stuck/
  );
  assert.ok(!log.includes('start'));
});

test('a failing start surfaces the error', async () => {
  await assert.rejects(
    runCallSwitch(
      steps([], {
        start: async () => {
          throw new Error('no room');
        },
      })
    ),
    /no room/
  );
});
