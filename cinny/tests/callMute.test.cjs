// #107: who is muted in the call. You from Diddy's call control, the others from their LiveKit
// microphone publication, Element Call's tile icon only as a narrow fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;

const muteFile = path.join(__dirname, '../src/app/plugins/call/callMute.ts');
const stageFile = path.join(__dirname, '../src/app/plugins/call/callStage.ts');
const frameMenuFile = path.join(__dirname, '../src/app/plugins/callFrameMenu.ts');

function load() {
  const frameMenu = {};
  vm.runInNewContext(compile(frameMenuFile), { exports: frameMenu, require: () => ({}) });
  const mute = {};
  vm.runInNewContext(compile(muteFile), { exports: mute, WeakMap, Date });
  const stage = {};
  vm.runInNewContext(compile(stageFile), {
    exports: stage,
    require: (id) => {
      if (id === '../callFrameMenu') return frameMenu;
      if (id === './callMute') return mute;
      throw new Error(id);
    },
  });
  return { ...mute, ...stage };
}

const ME = '@me:x.eu';
const BOB = '@bob:x.eu';

const MUTE_ICON = '[class*="_muteIcon_"][data-muted]';

/**
 * A fake Element Call person tile. `icon`: the name tag mute icon's data-muted (undefined: no
 * icon, the spotlight). `stray`: an unrelated element with data-muted="true" somewhere in the
 * tile (must never count). `vmodel`: Element Call's user media model on the tile's fiber.
 */
const tile = ({ userId, icon, stray = false, vmodel }) => {
  const el = {
    className: '_tile_y_2',
    getAttribute: () => null,
    querySelector: (sel) => {
      if (sel === '[aria-label]') return { getAttribute: () => userId };
      if (sel === '[data-testid="name_tag"]') return { textContent: userId };
      if (sel === MUTE_ICON) {
        return icon === undefined ? null : { getAttribute: () => String(icon) };
      }
      // the old broad query: an unrelated element (or the icon) would match it
      if (sel === '[data-muted="true"]') return stray || icon === true ? {} : null;
      return null;
    },
  };
  if (vmodel)
    el.__reactFiber$test = { memoizedProps: {}, return: { memoizedProps: { vm: vmodel } } };
  return el;
};

const behavior = (value) => ({ value });

const userVm = (userId, { local = false, identity, playbackMuted = false, audioEnabled } = {}) => ({
  type: 'user',
  id: `${userId}:DEV:0`,
  userId,
  local,
  rtcBackendIdentity: identity,
  playbackMuted$: behavior(playbackMuted),
  audioEnabled$: behavior(audioEnabled),
});

const participant = (identity, micMuted) => ({
  identity,
  getTrackPublication: (source) =>
    source === 'microphone' && micMuted !== undefined ? { source, isMuted: micMuted } : undefined,
});

const lkRoom = (remotes, state = 'connected') => ({
  state,
  localParticipant: { identity: `${ME}:MYDEV` },
  remoteParticipants: new Map(remotes.map((p) => [p.identity, p])),
});

// a call document whose React tree hands `rooms` to LivekitRoomAudioRenderer-like fibers
const callDoc = (tiles, rooms = []) => {
  let fiber = null;
  rooms
    .slice()
    .reverse()
    .forEach((room) => {
      fiber = { memoizedProps: { livekitRoom: room, url: 'wss://sfu' }, sibling: fiber };
    });
  const hostRoot = {
    memoizedProps: null,
    child: { memoizedProps: { children: [] }, child: fiber },
  };
  const root = { __reactContainer$test: { stateNode: { current: hostRoot } } };
  return {
    querySelectorAll: () => tiles,
    getElementById: (id) => (id === 'root' ? root : null),
  };
};

const mutedOf = (model) => Object.fromEntries(model.people.map((p) => [p.userId, p.muted]));

test('initial state: your tile says muted while you send, LiveKit says Bob is muted', () => {
  // the F1 picture: Element Call shows you muted and Bob unmuted, the media say the opposite
  const { readCallStage } = load();
  const doc = callDoc(
    [tile({ userId: BOB, icon: false }), tile({ userId: ME, icon: true })],
    [lkRoom([participant(`${BOB}:BOBDEV`, true)])]
  );
  const model = readCallStage(doc, { userId: ME, microphone: true });
  assert.deepEqual(mutedOf(model), { [BOB]: true, [ME]: false });
});

test('initial state with everybody unmuted is unmuted everywhere', () => {
  const { readCallStage } = load();
  const doc = callDoc(
    [tile({ userId: BOB, icon: false }), tile({ userId: ME, icon: true })],
    [lkRoom([participant(`${BOB}:BOBDEV`, false)])]
  );
  assert.deepEqual(mutedOf(readCallStage(doc, { userId: ME, microphone: true })), {
    [BOB]: false,
    [ME]: false,
  });
});

test('local mute and unmute follow the call control, not the tile', () => {
  const { readCallStage } = load();
  const tiles = [tile({ userId: ME, icon: false, vmodel: userVm(ME, { local: true }) })];
  const doc = callDoc(tiles, [lkRoom([])]);
  assert.equal(readCallStage(doc, { userId: ME, microphone: false }).people[0].muted, true);
  assert.equal(readCallStage(doc, { userId: ME, microphone: true }).people[0].muted, false);
});

test('remote mute and unmute follow the LiveKit publication, even when the tile is stale', () => {
  const { readCallStage } = load();
  const bob = participant(`${BOB}:BOBDEV`, true);
  const doc = callDoc(
    [tile({ userId: BOB, icon: false, vmodel: userVm(BOB, { identity: `${BOB}:BOBDEV` }) })],
    [lkRoom([bob])]
  );
  const local = { userId: ME, microphone: true };
  assert.equal(readCallStage(doc, local).people[0].muted, true);
  // LiveKit room objects are live: unmuting shows on the next read
  bob.getTrackPublication = (s) => (s === 'microphone' ? { source: s, isMuted: false } : undefined);
  assert.equal(readCallStage(doc, local).people[0].muted, false);
});

test('no false positives from unrelated data-muted elements or "muted for me"', () => {
  const { readCallStage, tileMuteMarker } = load();
  // no LiveKit room reachable: the fallback reads only the name tag mute icon
  const stray = tile({ userId: BOB, icon: false, stray: true });
  assert.equal(stray.querySelector('[data-muted="true"]') !== null, true, 'old query matched');
  assert.equal(readCallStage(callDoc([stray]), undefined).people[0].muted, false);
  // you muted Bob for yourself: Element Call sets the same icon state, his mic is on
  const forMe = tile({
    userId: BOB,
    icon: true,
    vmodel: userVm(BOB, { playbackMuted: true, audioEnabled: true }),
  });
  assert.equal(
    tileMuteMarker(forMe, userVm(BOB, { playbackMuted: true, audioEnabled: true })),
    false
  );
  assert.equal(readCallStage(callDoc([forMe]), undefined).people[0].muted, false);
  // the real icon still counts in the fallback
  assert.equal(readCallStage(callDoc([tile({ userId: BOB, icon: true })])).people[0].muted, true);
  // a spotlight tile without icon knows nothing and does not override the grid tile
  const model = readCallStage(callDoc([tile({ userId: BOB }), tile({ userId: BOB, icon: true })]));
  assert.equal(model.people[0].muted, true);
});

test('LiveKit lookup: identity first, then any device of the user; disconnected rooms ignored', () => {
  const { liveKitMicMuted } = load();
  const rooms = [
    lkRoom([participant(`${BOB}:A`, true), participant(`${BOB}:B`, false)]),
    lkRoom([participant(`${BOB}:C`, false)], 'disconnected'),
  ];
  assert.equal(liveKitMicMuted(rooms, BOB, `${BOB}:A`), true);
  assert.equal(liveKitMicMuted(rooms, BOB, `${BOB}:B`), false);
  // unknown identity (hashed or not yet connected): any device of Bob that sends
  assert.equal(liveKitMicMuted(rooms, BOB, 'other'), false);
  // only in a disconnected room / not there at all: unknown
  assert.equal(liveKitMicMuted([rooms[1]], BOB), undefined);
  assert.equal(liveKitMicMuted(rooms, '@carol:x.eu'), undefined);
  // no microphone publication at all: muted; a prefix of another user does not match
  assert.equal(liveKitMicMuted([lkRoom([participant(`${BOB}:D`)])], BOB), true);
  assert.equal(liveKitMicMuted([lkRoom([participant(`${BOB}x:x.eu:D`, false)])], BOB), undefined);
});

test('the sidebar reads the same: muted set from readCallStage', () => {
  const { readCallStage } = load();
  const doc = callDoc(
    [tile({ userId: BOB, icon: false }), tile({ userId: ME, icon: true })],
    [lkRoom([participant(`${BOB}:BOBDEV`, true)])]
  );
  const muted = [...readCallStage(doc, { userId: ME, microphone: true }).people]
    .filter((p) => p.muted)
    .map((p) => p.userId);
  assert.deepEqual(muted, [BOB]);
});

test('rooms are found through InCallView model items too, and cached per document', () => {
  const { findLiveKitRooms, cachedLiveKitRooms } = load();
  const room = lkRoom([]);
  const fiber = {
    memoizedProps: { vm: { livekitRoomItems$: behavior([{ livekitRoom: room, url: 'x' }]) } },
  };
  const root = { __reactContainer$x: { stateNode: { current: { child: fiber } } } };
  const doc = { getElementById: () => root };
  assert.deepEqual([...findLiveKitRooms(doc)], [room]);
  assert.equal(findLiveKitRooms({ getElementById: () => null }).length, 0);
  assert.equal(findLiveKitRooms(undefined).length, 0);
  const first = cachedLiveKitRooms(doc, 1000);
  fiber.memoizedProps = {};
  assert.equal(cachedLiveKitRooms(doc, 2000), first, 'cached');
  assert.equal(cachedLiveKitRooms(doc, 10000).length, 0, 'walked again');
});

// The hooks above, in the Element Call build Diddy ships: if an update renames them, this fails
// instead of the mute display silently going wrong.
test('the shipped Element Call still has the mute hooks', () => {
  const dist = path.join(
    __dirname,
    '../node_modules/@element-hq/element-call-embedded/dist/assets'
  );
  const files = fs.readdirSync(dist);
  const js = files
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  const css = files
    .filter((f) => /\.css$/.test(f))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  // the name tag icon: data-muted = playbackMuted || !audioEnabled, with the muteIcon class
  assert.ok(
    /"data-muted":\w+\|\|!\w+,className:\w+\.muteIcon/.test(js),
    'mute icon data-muted + muteIcon class'
  );
  assert.ok(/\._muteIcon_\w+/.test(css), 'muteIcon CSS module class');
  // the user media model: type, rtcBackendIdentity, playback mute
  assert.ok(js.includes('type:`user`'), 'user media type');
  assert.ok(js.includes('rtcBackendIdentity:'), 'rtcBackendIdentity');
  assert.ok(js.includes('playbackMuted$:'), 'playbackMuted$');
  // audioEnabled$ = microphone publication isMuted === false
  assert.ok(
    /audioEnabled\$:\w+\.behavior\(\w+\.pipe\(\w+\(\w+=>\w+\?\.microphoneTrack\?\.isMuted===!1\)\)\)/.test(
      js
    ),
    'audioEnabled from microphone publication'
  );
  // LiveKit rooms reach React as the livekitRoom prop and InCallView's livekitRoomItems$
  assert.ok(
    /livekitRoom:\w+,validIdentities:/.test(js),
    'LivekitRoomAudioRenderer livekitRoom prop'
  );
  assert.ok(js.includes('livekitRoomItems$'), 'livekitRoomItems$');
  // LiveKit: microphone source name, remoteParticipants map, getTrackPublication
  assert.ok(js.includes('Microphone=`microphone`'), 'microphone source');
  assert.ok(js.includes('remoteParticipants'), 'remoteParticipants');
  assert.ok(js.includes('getTrackPublication('), 'getTrackPublication');
});
