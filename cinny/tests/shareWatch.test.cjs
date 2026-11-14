// Screen shares only on request (#206): who shows, what Element Call and LiveKit receive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/shareWatch.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, console, Date }, { filename });

const ALEX = '@alex:example.org:PHONE:screen-share';
const SAM = '@sam:example.org:LAPTOP:screen-share';
const ME = '@me:example.org:MAC:screen-share';

const tile = (id) => {
  const attrs = new Map([['data-id', id]]);
  return {
    attrs,
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    hasAttribute: (n) => attrs.has(n),
    setAttribute: (n, v) => attrs.set(n, v),
    removeAttribute: (n) => attrs.delete(n),
  };
};
const fakeDoc = (tiles) => ({
  selectors: [],
  querySelectorAll(selector) {
    this.selectors.push(selector);
    return tiles;
  },
});
const participant = (identity, audio) => ({
  identity,
  getTrackPublication: (source) => (source === 'screen_share_audio' ? audio : undefined),
});
const audioPub = (enabled = true) => {
  const pub = {
    isEnabled: enabled,
    calls: [],
    setEnabled(v) {
      pub.calls.push(v);
      pub.isEnabled = v;
    },
  };
  return pub;
};
const room = (participants, localIdentity = '@me:example.org:MAC') => ({
  localParticipant: { identity: localIdentity },
  remoteParticipants: new Map(participants.map((p) => [p.identity, p])),
});

test('the share id names the LiveKit participant', () => {
  assert.equal(mod.shareIdentity(ALEX), '@alex:example.org:PHONE');
  assert.equal(mod.shareIdentity('@alex:example.org:PHONE'), undefined);
  assert.equal(mod.shareIdentity(':screen-share'), undefined);
});

test('your own share always shows, somebody else on your account does not', () => {
  const local = mod.localIdentities([room([])]);
  assert.equal(mod.isOwnShare(ME, local, '@me:example.org'), true);
  assert.equal(
    mod.isOwnShare('@me:example.org:PHONE:screen-share', local, '@me:example.org'),
    false
  );
  assert.equal(mod.isOwnShare(ALEX, local, '@me:example.org'), false);
  // no LiveKit room reachable: your user id decides
  assert.equal(mod.isOwnShare(ME, new Set(), '@me:example.org'), true);
  assert.equal(mod.isOwnShare(ALEX, new Set(), undefined), false);
});

test('a share is a card until Watch, Stop watching makes it one again', () => {
  const w = new mod.ShareWatch();
  let changes = 0;
  w.subscribe(() => (changes += 1));
  assert.equal(w.isWatched(ALEX), false);
  w.watch(ALEX, 0);
  assert.equal(w.isWatched(ALEX), true);
  assert.equal(w.getSnapshot().has(ALEX), true);
  w.watch(ALEX, 0);
  assert.equal(changes, 1);
  w.stop(ALEX);
  assert.equal(w.isWatched(ALEX), false);
  assert.equal(changes, 2);
});

test('the choice lasts while the share runs, a new share starts as a card again', () => {
  const w = new mod.ShareWatch();
  w.watch(ALEX, 0);
  // Element Call re-draws the tile: gone for a moment, still watched
  w.update([], 3000);
  w.update([ALEX], 4000);
  assert.equal(w.isWatched(ALEX), true);
  // the share ended
  w.update([], 4000 + mod.SHARE_GONE_MS + 1);
  assert.equal(w.isWatched(ALEX), false);
  w.update([ALEX], 20000);
  assert.equal(w.isWatched(ALEX), false);
  w.watch(SAM, 0);
  w.clear();
  assert.equal(w.getSnapshot().size, 0);
});

test('unwatched shares are paused in Element Call and their sound is switched off', () => {
  const alex = tile(ALEX);
  const sam = tile(SAM);
  const doc = fakeDoc([alex, sam]);
  const alexAudio = audioPub(true);
  const samAudio = audioPub(true);
  const rooms = [
    room([
      participant('@alex:example.org:PHONE', alexAudio),
      participant('@sam:example.org:LAPTOP', samAudio),
    ]),
  ];
  mod.applyShareWatch(doc, rooms, (id) => id === SAM);
  assert.equal(alex.hasAttribute(mod.SHARE_OFF_ATTR), true);
  assert.equal(sam.hasAttribute(mod.SHARE_OFF_ATTR), false);
  assert.deepEqual([...alexAudio.calls], [false]);
  assert.deepEqual([...samAudio.calls], []);
  assert.match(doc.selectors[0], /data-id\$=":screen-share"/);

  // nothing changed: nothing is sent again
  mod.applyShareWatch(doc, rooms, (id) => id === SAM);
  assert.deepEqual([...alexAudio.calls], [false]);

  // Watch on Alex: picture and sound come back
  mod.applyShareWatch(doc, rooms, () => true);
  assert.equal(alex.hasAttribute(mod.SHARE_OFF_ATTR), false);
  assert.deepEqual([...alexAudio.calls], [false, true]);
});

test('the stage going away shows every share again', () => {
  const alex = tile(ALEX);
  const audio = audioPub(false);
  alex.setAttribute(mod.SHARE_OFF_ATTR, 'true');
  mod.releaseShareWatch(fakeDoc([alex]), [room([participant('@alex:example.org:PHONE', audio)])]);
  assert.equal(alex.hasAttribute(mod.SHARE_OFF_ATTR), false);
  assert.deepEqual([...audio.calls], [true]);
});

test('broken rooms, participants without a share and a missing document are ignored', () => {
  assert.doesNotThrow(() => mod.applyShareWatch(undefined, [], () => false));
  const throwing = {
    identity: '@x:example.org:D',
    getTrackPublication: () => ({
      isEnabled: true,
      setEnabled: () => {
        throw new Error('unpublished');
      },
    }),
  };
  assert.doesNotThrow(() =>
    mod.applyShareWatch(
      fakeDoc([]),
      [{}, { state: 'disconnected' }, room([participant('@y:e:D', undefined), throwing])],
      () => false
    )
  );
});

test('the call document hides only the picture of tiles that are switched off', () => {
  assert.match(mod.SHARE_WATCH_CSS, /\[data-diddy-share-off\] video/);
  assert.match(mod.SHARE_WATCH_CSS, /display: none !important/);
});
