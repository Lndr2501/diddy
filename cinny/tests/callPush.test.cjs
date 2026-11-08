const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/diddy/callPush.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports, URL, JSON }, { filename });
const { parseCallPushTarget, callPushRequest } = moduleExports;

test('accepts an HTTPS ntfy target', () => {
  assert.deepEqual(
    { ...parseCallPushTarget({ server: 'https://ntfy.sh', topic: 'diddy_abc123' }) },
    { server: 'https://ntfy.sh', topic: 'diddy_abc123' }
  );
});

test('rejects targets that are not plain HTTPS or not a topic name', () => {
  for (const content of [
    undefined,
    null,
    'https://ntfy.sh/x',
    {},
    { server: 'http://ntfy.sh', topic: 'x' },
    { server: 'file:///etc/passwd', topic: 'x' },
    { server: 'https://user:pw@ntfy.sh', topic: 'x' },
    { server: 'https://ntfy.sh?x=1', topic: 'x' },
    { server: 'not a url', topic: 'x' },
    { server: 'https://ntfy.sh', topic: 'a/b' },
    { server: 'https://ntfy.sh', topic: '' },
    { server: 'https://ntfy.sh', topic: 'x'.repeat(65) },
    { server: 'https://ntfy.sh', topic: 7 },
  ]) {
    assert.equal(parseCallPushTarget(content), undefined, JSON.stringify(content));
  }
});

test('posts the caller name as JSON to the server root', () => {
  const { url, init } = callPushRequest(
    { server: 'https://ntfy.example.org', topic: 't' },
    'Jürgen'
  );
  assert.equal(url, 'https://ntfy.example.org/');
  assert.equal(init.method, 'POST');
  const body = JSON.parse(init.body);
  assert.equal(body.topic, 't');
  assert.equal(body.title, 'Jürgen is calling you');
  assert.equal(body.priority, 5);
  assert.equal(
    callPushRequest({ server: 'https://ntfy.sh/', topic: 't' }, 'A').url,
    'https://ntfy.sh/'
  );
});
