// Profile editor previews (#105): the draft as others see it, the presence it shows, layout helpers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '../src/app');
const cache = {};
const load = (file) => {
  if (cache[file]) return cache[file];
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = {};
  cache[file] = mod;
  vm.runInNewContext(code, {
    exports: mod,
    URL,
    console,
    Uint8Array,
    DataView,
    require: (id) => load(`${path.resolve(path.dirname(file), id)}.ts`),
  });
  return mod;
};
const pv = load(path.join(root, 'plugins/diddy/profilePreview.ts'));
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const STORED = {
  v: 1,
  bio: 'old bio',
  shownBadges: ['b1', 'b2'],
  animatedAvatarMxc: 'mxc://x.de/old0123456789',
  clientVersion: '1.0.0',
  card: { accent: '#112233' },
};

test('toDraft drops what the editor does not manage and copies deeply', () => {
  const draft = pv.toDraft(STORED);
  assert.deepEqual(plain(draft), { bio: 'old bio', clientVersion: '1.0.0', card: { accent: '#112233' } });
  draft.card.accent = '#000000';
  assert.equal(STORED.card.accent, '#112233');
  assert.deepEqual(plain(pv.toDraft(undefined)), {});
});

test('stableKey ignores key order, empty values and "off" switches', () => {
  assert.equal(pv.stableKey({ a: 1, b: { c: '' } }), pv.stableKey({ a: 1 }));
  assert.equal(pv.stableKey({ b: 2, a: 1 }), pv.stableKey({ a: 1, b: 2 }));
  assert.equal(pv.stableKey({ cardLayout: { glass: false } }), pv.stableKey({}));
  assert.notEqual(pv.stableKey({ bio: 'x' }), pv.stableKey({ bio: 'y' }));
});

test('mergeDraft keeps shown badges and the old avatar, replaces every editor field', () => {
  const merged = pv.mergeDraft(STORED, { bio: 'new', status: 'idle', card: undefined });
  assert.deepEqual(plain(merged), {
    v: 1,
    shownBadges: ['b1', 'b2'],
    animatedAvatarMxc: 'mxc://x.de/old0123456789',
    clientVersion: '1.0.0',
    bio: 'new',
    status: 'idle',
  });
  // a field cleared in the draft is gone, not kept from the stored profile
  assert.equal(merged.card, undefined);
  assert.deepEqual(plain(pv.mergeDraft(undefined, {})), { v: 1 });
});

test('previewProfile is sanitised like a profile from the sync', () => {
  const p = pv.previewProfile(
    STORED,
    {
      bio: 'x'.repeat(400),
      card: { accent: 'red; background:url(evil)', from: '#ff0000' },
      nameplate: { preset: 'nope' },
      links: [{ kind: 'web', url: 'javascript:alert(1)' }],
    },
    '2.3.4'
  );
  assert.equal(p.bio.length, 160);
  assert.equal(p.card.accent, undefined);
  assert.equal(p.card.from, '#ff0000');
  assert.equal(p.nameplate, undefined);
  assert.equal(p.links, undefined);
  assert.equal(p.clientVersion, '2.3.4');
  assert.deepEqual(plain(p.shownBadges), ['b1', 'b2']);
});

test('previewProfile without a shared version shows none', () => {
  assert.equal(pv.previewProfile(STORED, {}, undefined).clientVersion, undefined);
  assert.equal(pv.previewProfile(STORED, {}, 'not a version').clientVersion, undefined);
});

test('previewPresence: the state others see after saving the draft status', () => {
  assert.equal(pv.previewPresence(undefined).state, 'online');
  assert.equal(pv.previewPresence('online').state, 'online');
  assert.equal(pv.previewPresence('idle').state, 'idle');
  assert.equal(pv.previewPresence('dnd').state, 'dnd');
  assert.equal(pv.previewPresence('invisible').state, 'offline');
  assert.equal(pv.previewPresence('online', 'Coding').message, 'Coding');
  // the DND marker is not a status message of its own
  assert.equal(pv.previewPresence('dnd', 'Do not disturb').message, undefined);
});

test('shownCardLayout: popout and big window defaults', () => {
  assert.equal(pv.shownCardLayout(undefined, false), 'standard');
  assert.equal(pv.shownCardLayout(undefined, true), 'expanded');
  const p = { cardLayout: { layout: 'compact', big: { layout: 'tabs' } } };
  assert.equal(pv.shownCardLayout(p, false), 'compact');
  assert.equal(pv.shownCardLayout(p, true), 'tabs');
});

test('fitScale never grows and never collapses', () => {
  assert.equal(pv.fitScale(300, 600), 0.5);
  assert.equal(pv.fitScale(900, 600), 1);
  assert.equal(pv.fitScale(0, 600), 1);
  assert.equal(pv.fitScale(300, 0), 1);
  assert.equal(pv.fitScale(Number.NaN, 600), 1);
  assert.equal(pv.fitScale(200, 600), 0.333);
});

test('previewTargetForTab and the target list', () => {
  assert.equal(pv.previewTargetForTab('layout'), 'card');
  assert.equal(pv.previewTargetForTab('privacy'), undefined);
  const ids = pv.PREVIEW_TARGETS.map((t) => t.id);
  assert.deepEqual(plain(ids), ['card', 'window', 'members', 'dms', 'panel', 'call']);
});

test('deviceMotionNotes names what this device switched off', () => {
  const all = { profileEffects: true, nameplates: true, profileFrames: true, profile: true, reducedMotion: false };
  assert.deepEqual(plain(pv.deviceMotionNotes(all)), []);
  assert.match(pv.deviceMotionNotes({ ...all, reducedMotion: true, nameplates: false })[0], /Reduce motion/);
  const notes = pv.deviceMotionNotes({ ...all, profileEffects: false, nameplates: false });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /profile effects and nameplates/);
  assert.match(pv.deviceMotionNotes({ ...all, profileFrames: false })[0], /frames are hidden/);
});
