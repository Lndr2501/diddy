// What a receiving client keeps of a profile sent by someone else (message-mode sync, #29).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const dir = path.join(__dirname, '../src/app/plugins/diddy');
const cache = {};
const load = (name) => {
  if (cache[name]) return cache[name];
  const code = ts.transpileModule(fs.readFileSync(path.join(dir, `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const mod = {};
  cache[name] = mod;
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    console,
    require: (id) => load(id.replace('./', '')),
  });
  return mod;
};
const { sanitizeProfile } = load('sanitize');
const plain = (v) => JSON.parse(JSON.stringify(v));

const MXC = 'mxc://matrix.tllx.eu/AbCdEf0123456789AbCdEf01';
const full = {
  v: 1,
  bio: 'Hallo',
  about: { location: 'Bonn, DE', age: '18' },
  interests: ['Homelab', 'Musik'],
  links: [{ kind: 'github', url: 'https://github.com/lndr' }],
  activity: { kind: 'music', text: 'Legacy', detail: 'PIXY' },
  cardLayout: { layout: 'tabs', hidden: ['links'], order: ['bio'], theme: 'dark', glass: true },
  card: { accent: '#874efe', bannerMxc: MXC },
};

test('a full profile survives the receiving side unchanged', () => {
  const out = plain(sanitizeProfile(full));
  assert.deepEqual(out.about, full.about);
  assert.deepEqual(out.interests, full.interests);
  assert.deepEqual(out.links, full.links);
  assert.deepEqual(out.activity, full.activity);
  assert.deepEqual(out.cardLayout, full.cardLayout);
  assert.equal(out.card.bannerMxc, MXC);
});

test('hostile values in the new fields never reach the card', () => {
  const out = plain(
    sanitizeProfile({
      ...full,
      links: [
        { kind: 'web', url: 'javascript:alert(1)' },
        { kind: 'github', url: 'https://evil.example/x' },
        { kind: 'web', url: 'https://example.org/ok' },
      ],
      about: { location: '<img src=x onerror=alert(1)>' },
      cardLayout: { layout: 'giant', theme: 'neon', hidden: ['x'] },
      activity: { kind: 'hack', text: 'x' },
    })
  );
  assert.deepEqual(out.links, [{ kind: 'web', url: 'https://example.org/ok' }]);
  // text is shown through React (escaped), but it stays plain text and short
  assert.equal(out.about.location, '<img src=x onerror=alert(1)>');
  assert.equal(out.cardLayout, undefined);
  assert.equal(out.activity, undefined);
});

test('an old profile without the new fields still works', () => {
  assert.deepEqual(plain(sanitizeProfile({ v: 1, bio: 'x', status: 'idle' })), { v: 1, status: 'idle', bio: 'x' });
  assert.equal(sanitizeProfile({ v: 2 }), undefined);
});
