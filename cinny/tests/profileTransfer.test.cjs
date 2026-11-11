// #157: export / import of the profile customization. An imported file is untrusted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const cache = {};
const load = (file) => {
  if (cache[file]) return cache[file];
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = {};
  cache[file] = mod;
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    TextEncoder,
    console,
    require: (id) =>
      id.startsWith('.') ? load(`${path.resolve(path.dirname(file), id)}.ts`) : require(id),
  });
  return mod;
};

const { exportProfile, importProfile, MAX_PROFILE_FILE_BYTES, PROFILE_FILE_KIND } = load(
  path.join(__dirname, '../src/app/plugins/diddy/profileTransfer.ts')
);

const draft = {
  nameStyle: { font: 'serif', color: '#ff00aa', bold: true },
  card: { from: '#112233', to: '#445566', angle: 90, accent: '#ff00aa' },
  bio: 'hello there',
  interests: ['music', 'games'],
  status: 'dnd',
  clientVersion: '1.5.1',
};

test('export leaves out the status and the version', () => {
  const file = JSON.parse(exportProfile(draft));
  assert.equal(file.kind, PROFILE_FILE_KIND);
  assert.equal(file.profile.status, undefined);
  assert.equal(file.profile.clientVersion, undefined);
  assert.equal(file.profile.bio, 'hello there');
  assert.equal(file.profile.v, 1);
});

test('what is exported imports again, equal', () => {
  const back = importProfile(exportProfile(draft));
  assert.equal(back.ok, true);
  assert.equal(back.draft.bio, 'hello there');
  assert.equal(back.draft.card.from, '#112233');
  assert.equal(back.draft.nameStyle.bold, true);
  assert.deepEqual(Array.from(back.draft.interests), ['music', 'games']);
  assert.equal(back.draft.status, undefined);
});

test('a status or version inside a file is ignored', () => {
  const text = JSON.stringify({ v: 1, bio: 'x', status: 'invisible', clientVersion: '9.9.9' });
  const back = importProfile(text);
  assert.equal(back.ok, true);
  assert.equal(back.draft.status, undefined);
  assert.equal(back.draft.clientVersion, undefined);
});

test('a bare profile object is accepted', () => {
  assert.equal(importProfile(JSON.stringify({ v: 1, bio: 'bare' })).ok, true);
});

test('unsafe values are dropped by the sanitiser', () => {
  const text = JSON.stringify({
    v: 1,
    bio: 'ok',
    card: { from: 'url(javascript:alert(1))', bannerMxc: 'https://evil.example/x.png' },
  });
  const back = importProfile(text);
  assert.equal(back.ok, true);
  assert.equal(back.draft.card, undefined);
});

test('rubbish is rejected with a message, never thrown', () => {
  [
    'not json',
    '[]',
    'null',
    '{"v":2,"bio":"x"}',
    JSON.stringify({ v: 1 }),
    JSON.stringify({ kind: PROFILE_FILE_KIND, v: 1, profile: 5 }),
  ].forEach((text) => {
    const back = importProfile(text);
    assert.equal(back.ok, false, text);
    assert.equal(typeof back.error, 'string');
  });
});

test('a file that is far too big is rejected', () => {
  const back = importProfile(JSON.stringify({ v: 1, bio: 'x'.repeat(MAX_PROFILE_FILE_BYTES) }));
  assert.equal(back.ok, false);
});
