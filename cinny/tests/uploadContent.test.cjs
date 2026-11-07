const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/matrix.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

// Use the SDK error type while stubbing unrelated imports of this utility module.
const { uploadContent } = (() => {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => (id === 'matrix-js-sdk' ? require(id) : {}),
  }, { filename });
  return exports;
})();

async function rejectedUpload(reason) {
  let received;
  await uploadContent({ uploadContent: () => Promise.reject(reason) }, {}, {
    onSuccess: () => assert.fail('rejected upload must not succeed'),
    onError: (error) => { received = error; },
  });
  assert.ok(received instanceof require('matrix-js-sdk').MatrixError);
  return received;
}

test('upload rejection preserves the Matrix code separately from the message', async () => {
  const { MatrixError } = require('matrix-js-sdk');
  const original = new MatrixError({
    error: 'The attachment exceeds the upload limit',
    errcode: 'M_TOO_LARGE',
  });
  const received = await rejectedUpload(original);
  assert.equal(received.errcode, 'M_TOO_LARGE');
  assert.equal(received.data.error, original.message);
});

test('a Matrix code is preserved even without a name', async () => {
  const received = await rejectedUpload({ message: 'Try later', errcode: 'M_LIMIT_EXCEEDED' });
  assert.equal(received.errcode, 'M_LIMIT_EXCEEDED');
  assert.equal(received.data.error, 'Try later');
});

test('ordinary errors do not turn their name or message into a Matrix code', async () => {
  const received = await rejectedUpload(new Error('Network unavailable'));
  assert.equal(received.errcode, undefined);
  assert.equal(received.data.error, 'Network unavailable');
});

test('non-string codes and null rejections are handled safely', async () => {
  for (const reason of [{ message: 'Failed', errcode: 42 }, null]) {
    const received = await rejectedUpload(reason);
    assert.equal(received.errcode, undefined);
  }
});
