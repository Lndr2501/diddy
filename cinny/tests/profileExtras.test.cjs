// Validation of the optional profile card parts (#29): links, facts, interests, layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/diddy/profileExtras.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, console, URL });
// values created inside the vm have another prototype: round-trip them for deepEqual
const plain = (v) => JSON.parse(JSON.stringify(v));

test('links must be https, without credentials, and fit their kind', () => {
  assert.equal(mod.safeLinkUrl('github', 'https://github.com/lndr'), 'https://github.com/lndr');
  assert.equal(mod.safeLinkUrl('github', 'http://github.com/lndr'), undefined);
  assert.equal(mod.safeLinkUrl('github', 'https://evil.example/github.com'), undefined);
  assert.equal(mod.safeLinkUrl('github', 'https://github.com.evil.example/x'), undefined);
  assert.equal(mod.safeLinkUrl('web', 'https://user:pw@example.org/'), undefined);
  assert.equal(mod.safeLinkUrl('web', 'javascript:alert(1)'), undefined);
  assert.equal(mod.safeLinkUrl('web', 'https://localhost/'), undefined);
  assert.equal(mod.safeLinkUrl('web', 'https://example.org/' + 'a'.repeat(300)), undefined);
  assert.equal(mod.safeLinkUrl('youtube', 'https://www.youtube.com/@x'), 'https://www.youtube.com/@x');
});

test('link kind is guessed from the address', () => {
  assert.equal(mod.guessLinkKind('https://github.com/x'), 'github');
  assert.equal(mod.guessLinkKind('https://example.org'), 'web');
  assert.equal(mod.guessLinkKind('not a url'), 'web');
});

test('links: bad entries are dropped, duplicates and the 8 entry cap apply', () => {
  const raw = [
    { kind: 'github', url: 'https://github.com/a' },
    { kind: 'github', url: 'https://github.com/a' },
    { kind: 'nope', url: 'https://github.com/b' },
    { kind: 'web', url: 'ftp://example.org' },
    ...Array.from({ length: 20 }, (_, i) => ({ kind: 'web', url: `https://example.org/${i}` })),
  ];
  const out = plain(mod.sanitizeLinks(raw));
  assert.equal(out.length, 8);
  assert.deepEqual(out[0], { kind: 'github', url: 'https://github.com/a' });
  assert.equal(mod.sanitizeLinks('x'), undefined);
});

test('about facts are trimmed, cut and empty ones removed', () => {
  const out = plain(mod.sanitizeAbout({ pronouns: ' er/ihm ', location: 'Bonn\n\u0000DE', age: '', work: 5, extra: 'x' }));
  assert.deepEqual(out, { pronouns: 'er/ihm', location: 'Bonn  DE' });
  assert.equal(mod.sanitizeAbout({ age: '' }), undefined);
  assert.equal(mod.sanitizeAbout({ location: 'x'.repeat(500) }).location.length, 40);
});

test('interests: unique, at most 12, each at most 24 characters', () => {
  const raw = ['Homelab', 'Homelab', ' ', 7, 'x'.repeat(100), ...Array.from({ length: 30 }, (_, i) => `t${i}`)];
  const out = plain(mod.sanitizeInterests(raw));
  assert.equal(out.length, 12);
  assert.equal(out[0], 'Homelab');
  assert.equal(out[1].length, 24);
});

test('activity needs a known kind and a text', () => {
  assert.deepEqual(plain(mod.sanitizeActivity({ kind: 'music', text: 'Legacy', detail: 'PIXY' })), {
    kind: 'music',
    text: 'Legacy',
    detail: 'PIXY',
  });
  assert.equal(mod.sanitizeActivity({ kind: 'stream', text: 'x' }), undefined);
  assert.equal(mod.sanitizeActivity({ kind: 'game', text: '  ' }), undefined);
});

test('card layout settings keep only known layouts and modules', () => {
  const out = plain(mod.sanitizeCardLayout({ layout: 'tabs', hidden: ['links', 'x', 'links'], order: ['bio', 'zzz'] }));
  assert.deepEqual(out, { layout: 'tabs', hidden: ['links'], order: ['bio'] });
  assert.equal(mod.sanitizeCardLayout({ layout: 'huge' }), undefined);
});

test('visible modules follow the layout, the hidden list and the owner order', () => {
  assert.deepEqual(plain(mod.visibleModules(undefined)), ['bio', 'about', 'links', 'sharedRooms']);
  assert.deepEqual(plain(mod.visibleModules({ layout: 'compact' })), ['bio']);
  assert.deepEqual(
    plain(mod.visibleModules({ layout: 'expanded', hidden: ['activity'], order: ['links', 'bio'] })),
    ['links', 'bio', 'about', 'interests', 'sharedRooms']
  );
  // a module the layout does not offer cannot be forced on through the order
  assert.deepEqual(plain(mod.visibleModules({ layout: 'compact', order: ['links'] })), ['bio']);
});

test('card look: theme, glass and calm are validated', () => {
  assert.deepEqual(plain(mod.sanitizeCardLayout({ theme: 'light', glass: true, calm: true })), {
    theme: 'light',
    glass: true,
    calm: true,
  });
  assert.equal(mod.sanitizeCardLayout({ theme: 'auto', glass: 'yes', calm: 1 }), undefined);
  assert.equal(mod.sanitizeCardLayout({ theme: 'neon' }), undefined);
});

test('big profile settings keep only known values', () => {
  assert.deepEqual(
    plain(mod.sanitizeCardLayout({ big: { layout: 'tabs', banner: 'hero', avatar: 'normal' } })),
    { big: { layout: 'tabs', banner: 'hero', avatar: 'normal' } }
  );
  // the small-card-only layouts are not offered for the big window
  assert.deepEqual(plain(mod.sanitizeCardLayout({ big: { layout: 'compact', banner: 'tall' } })), {
    big: { banner: 'tall' },
  });
  assert.equal(mod.sanitizeCardLayout({ big: { layout: 'huge', banner: 9 } }), undefined);
  assert.equal(mod.sanitizeCardLayout({ big: 'tall' }), undefined);
});
