/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-empty-function */
// Issue #144: the RNNoise worklet keeps its wasm state until the node is destroyed, so a node
// that is dropped must be disconnected AND destroyed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/noiseSuppression.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const exported = {};
vm.runInNewContext(
  output,
  {
    exports: exported,
    Promise,
    setTimeout,
    clearTimeout,
    require: (id) => {
      if (id === '../diagnostics') return { diag: () => {} };
      return {};
    },
  },
  { filename }
);

test('releasing a suppressor disconnects it and frees the worklet state', () => {
  const calls = [];
  const node = {
    disconnect: () => calls.push('disconnect'),
    destroy: () => calls.push('destroy'),
  };
  exported.releaseNoiseSuppressor(node);
  assert.deepEqual(calls, ['disconnect', 'destroy']);
});

test('a node without destroy (plain AudioNode) is only disconnected', () => {
  let disconnected = 0;
  exported.releaseNoiseSuppressor({
    disconnect: () => {
      disconnected += 1;
    },
  });
  assert.equal(disconnected, 1);
});

test('releasing nothing does nothing', () => {
  assert.doesNotThrow(() => exported.releaseNoiseSuppressor(undefined));
});

test('a node that is already disconnected is still destroyed', () => {
  let destroyed = 0;
  exported.releaseNoiseSuppressor({
    disconnect: () => {
      throw new Error('InvalidAccessError');
    },
    destroy: () => {
      destroyed += 1;
    },
  });
  assert.equal(destroyed, 1);
});
