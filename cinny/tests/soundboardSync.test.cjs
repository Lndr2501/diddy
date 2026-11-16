// #248: MyInstants sounds of the soundboard synced through the account data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/soundboardSync.ts');
const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const s = {};
vm.runInNewContext(out, { exports: s }, { filename });

const j = (x) => JSON.parse(JSON.stringify(x));
const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const a = '/media/sounds/bruh.mp3';
const b = '/media/sounds/vine-boom.mp3';

test('only MyInstants sound paths are accepted', () => {
  assert.equal(s.isMyInstantsPath(a), true);
  for (const bad of ['https://evil/x.mp3', '/media/sounds/../x', '/other/x.mp3', '/media/sounds/x?y', 42, '']) {
    assert.equal(s.isMyInstantsPath(bad), false, String(bad));
  }
  const state = s.parseSoundboardSync(
    {
      sounds: [
        { path: a, name: '  Bruh  ', added_ts: 5 },
        { path: 'https://evil/x.mp3', name: 'x', added_ts: 5 },
        { path: b, name: '', added_ts: 5 },
        { path: b, name: 'Boom', added_ts: -1 },
      ],
      removed: [{ path: '/media/sounds/../etc', removed_ts: 1 }],
    },
    NOW
  );
  assert.deepEqual(JSON.parse(JSON.stringify(state)), { sounds: [{ path: a, name: 'Bruh', added_ts: 5 }], removed: [] });
});

test('add and remove: the newer one wins, also across a merge', () => {
  let state = s.addSyncedSounds(s.emptySoundboardSync(), [{ path: a, name: 'Bruh' }, { path: b, name: 'Boom' }], NOW);
  assert.deepEqual(j(state.sounds.map((x) => x.path).sort()), [a, b].sort());
  const removed = s.removeSyncedSound(state, a, NOW + 1);
  assert.deepEqual(j(removed.sounds.map((x) => x.path)), [b]);
  assert.deepEqual(j(removed.removed.map((x) => x.path)), [a]);
  // the other device still has the old list: the removal survives the merge
  const merged = s.mergeSoundboardSync(state, removed, NOW + 2);
  assert.deepEqual(j(merged.sounds.map((x) => x.path)), [b]);
  // adding again after a removal wins even with a clock that is behind
  state = s.addSyncedSounds(removed, [{ path: a, name: 'Bruh' }], NOW - 1000);
  assert.ok(state.sounds.some((x) => x.path === a));
  assert.equal(state.removed.length, 0);
  // nothing changes for a sound that is already there
  assert.strictEqual(s.addSyncedSounds(state, [{ path: a, name: 'Bruh' }], NOW), state);
});

test('old removal markers are dropped, the list has a limit', () => {
  const state = s.parseSoundboardSync({ removed: [{ path: a, removed_ts: NOW - 31 * DAY }, { path: b, removed_ts: NOW - DAY }] }, NOW);
  assert.deepEqual(j(state.removed.map((x) => x.path)), [b]);
  const many = Array.from({ length: s.SOUNDBOARD_SYNC_LIMIT + 5 }, (_, i) => ({ path: `/media/sounds/s${i}.mp3`, name: `s${i}` }));
  const full = s.addSyncedSounds(s.emptySoundboardSync(), many, NOW);
  assert.equal(full.sounds.length, s.SOUNDBOARD_SYNC_LIMIT);
  assert.strictEqual(s.addSyncedSounds(full, [{ path: '/media/sounds/new.mp3', name: 'new' }], NOW), full);
  assert.ok(JSON.stringify(s.toSoundboardSyncContent(full)).length < 60000);
});

test('the plan downloads, removes, links and publishes', () => {
  const state = s.parseSoundboardSync(
    {
      sounds: [
        { path: a, name: 'Bruh', added_ts: 3 },
        { path: b, name: 'Vine Boom', added_ts: 2 },
        { path: '/media/sounds/new.mp3', name: 'New', added_ts: 1 },
      ],
      removed: [{ path: '/media/sounds/gone.mp3', removed_ts: NOW - DAY }],
    },
    NOW
  );
  const plan = s.planSoundboardSync(state, [
    { id: '1', name: 'Bruh', myinstants: a },
    { id: '2', name: 'vine boom' },
    { id: '3', name: 'Gone', myinstants: '/media/sounds/gone.mp3' },
    { id: '4', name: 'Local', myinstants: '/media/sounds/local.mp3' },
    { id: '5', name: 'My own file' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), {
    download: [{ path: '/media/sounds/new.mp3', name: 'New' }],
    remove: ['3'],
    link: [{ id: '2', path: b }],
    publish: [{ path: '/media/sounds/local.mp3', name: 'Local' }],
  });
});

test('a crossed write is detected', () => {
  const mine = s.addSyncedSounds(s.emptySoundboardSync(), [{ path: a, name: 'Bruh' }], NOW);
  const theirs = s.toSoundboardSyncContent(s.addSyncedSounds(s.emptySoundboardSync(), [{ path: b, name: 'Boom' }], NOW));
  assert.equal(s.soundboardSyncNeedsRewrite(theirs, mine, NOW), true);
  assert.equal(s.soundboardSyncNeedsRewrite(s.toSoundboardSyncContent(mine), mine, NOW), false);
});

test('the desktop app runs the sync and the import records the MyInstants path', () => {
  const root = path.join(__dirname, '../src/app');
  const features = fs.readFileSync(path.join(root, 'pages/client/ClientNonUIFeatures.tsx'), 'utf8');
  assert.match(features, /useSoundboardSync\(\);/);
  const imp = fs.readFileSync(path.join(root, 'features/call/MyInstantsImport.tsx'), 'utf8');
  assert.match(imp, /addClipFromBytes\(items\[i\]\.name, bytes, 'audio\/mpeg', items\[i\]\.path\)/);
});
