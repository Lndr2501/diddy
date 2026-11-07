// "Call" button on the profile card (#55): finds the private chat to ring someone in.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/directCall.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const { findDirectRoomId, PROFILE_CALL_PREFERENCES } = mod;

const always = () => true;

test('finds the direct room of the user', () => {
  const content = { '@a:x.org': ['!one:x.org'], '@b:x.org': ['!two:x.org'] };
  assert.equal(findDirectRoomId(content, '@b:x.org', always), '!two:x.org');
});

test('skips rooms we have left and takes the next joined one', () => {
  const content = { '@a:x.org': ['!old:x.org', '!new:x.org'] };
  assert.equal(
    findDirectRoomId(content, '@a:x.org', (id) => id === '!new:x.org'),
    '!new:x.org'
  );
});

test('no direct room: undefined, so one is created', () => {
  assert.equal(findDirectRoomId({ '@a:x.org': ['!one:x.org'] }, '@c:x.org', always), undefined);
  assert.equal(
    findDirectRoomId({ '@a:x.org': ['!gone:x.org'] }, '@a:x.org', () => false),
    undefined
  );
});

test('tolerates missing or malformed account data', () => {
  assert.equal(findDirectRoomId(undefined, '@a:x.org', always), undefined);
  assert.equal(findDirectRoomId(null, '@a:x.org', always), undefined);
  assert.equal(findDirectRoomId({ '@a:x.org': 'nope' }, '@a:x.org', always), undefined);
  assert.equal(
    findDirectRoomId({ '@a:x.org': [1, null, '!ok:x.org'] }, '@a:x.org', always),
    '!ok:x.org'
  );
});

test('the profile call is voice only', () => {
  assert.equal(PROFILE_CALL_PREFERENCES.video, false);
  assert.equal(PROFILE_CALL_PREFERENCES.microphone, true);
});
