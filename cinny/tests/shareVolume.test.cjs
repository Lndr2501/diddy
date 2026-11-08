// Volume and "mute for me" of somebody else's screen share, from Element Call's own state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/shareVolume.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(output, { exports: mod, require: () => ({}) }, { filename });

const SHARE_ID = '@gho:x.org:DEVICE:screen-share';

const behavior = (value) => {
  const listeners = new Set();
  return {
    get value() {
      return value;
    },
    next(v) {
      value = v;
      listeners.forEach((fn) => fn(v));
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(value);
      return { unsubscribe: () => listeners.delete(fn) };
    },
    listeners,
  };
};

/** Element Call's view model of a remote screen share (the parts Diddy uses), with its logic. */
const shareVm = ({ id = SHARE_ID, audio = true, local = false, type = 'screen share' } = {}) => {
  const state = { volume: 1, committed: 1 };
  const volume$ = behavior(1);
  return {
    id,
    type,
    local,
    playbackVolume$: volume$,
    audioEnabled$: behavior(audio),
    adjustPlaybackVolume: (v) => {
      state.volume = v;
      volume$.next(v);
    },
    commitPlaybackVolume: () => {
      if (state.volume !== 0) state.committed = state.volume;
    },
    togglePlaybackMuted: () => {
      state.volume = state.volume === 0 ? state.committed : 0;
      volume$.next(state.volume);
    },
  };
};

/** A tile element as React leaves it: the fiber chain up to the owners that got `vm`. */
const tileWith = (model, { dataId = SHARE_ID, depth = 4, key = '__reactFiber$abc123' } = {}) => {
  let fiber = { memoizedProps: { vm: model } };
  for (let i = 0; i < depth; i += 1) fiber = { memoizedProps: { className: 'x' }, return: fiber };
  return {
    [key]: fiber,
    getAttribute: (name) => (name === 'data-id' ? dataId : null),
  };
};

test('finds the view model of a share through the React props of its tile', () => {
  const model = shareVm();
  assert.equal(mod.shareVmOfTile(tileWith(model)), model);
});

test('never returns the model of another tile, your own share or a camera', () => {
  // a model higher up that belongs to something else (the id does not match the tile)
  assert.equal(mod.shareVmOfTile(tileWith(shareVm({ id: 'other:screen-share' }))), undefined);
  assert.equal(mod.shareVmOfTile(tileWith(shareVm({ local: true }))), undefined);
  assert.equal(mod.shareVmOfTile(tileWith(shareVm({ type: 'user' }))), undefined);
  // too far up: not this tile's owner any more
  assert.equal(mod.shareVmOfTile(tileWith(shareVm(), { depth: 40 })), undefined);
  // no React fiber (an Element Call that is not React any more), no tile
  assert.equal(mod.shareVmOfTile(tileWith(shareVm(), { key: 'somethingElse' })), undefined);
  assert.equal(mod.shareVmOfTile(null), undefined);
});

test('a model without the volume functions is not used', () => {
  const model = shareVm();
  delete model.commitPlaybackVolume;
  assert.equal(mod.shareVmOfTile(tileWith(model)), undefined);
  assert.equal(mod.isShareVolumeVm({ ...shareVm(), playbackVolume$: 1 }), false);
});

test('picks the tile of exactly the share asked for, with several shares running', () => {
  const a = shareVm({ id: '@a:x.org:D1:screen-share' });
  const b = shareVm({ id: '@b:x.org:D2:screen-share' });
  const tiles = [tileWith(a, { dataId: a.id }), tileWith(b, { dataId: b.id })];
  const doc = {
    querySelectorAll: (selector) => {
      assert.equal(selector, '[data-testid="videoTile"][data-id]');
      return tiles;
    },
  };
  assert.equal(mod.findShareVolumeVm(doc, b.id), b);
  assert.equal(mod.findShareVolumeVm(doc, a.id), a);
  assert.equal(mod.findShareVolumeVm(doc, 'gone:screen-share'), undefined);
  assert.equal(mod.findShareVolumeVm(doc, undefined), undefined);
  assert.equal(mod.findShareVolumeVm(null, a.id), undefined);
});

test('reads, changes, mutes and restores the volume through Element Call', () => {
  const model = shareVm();
  let changes = 0;
  const stop = mod.watchShareVolume(model, () => {
    changes += 1;
  });
  const before = changes;
  assert.deepEqual({ ...mod.readShareVolume(model) }, { hasAudio: true, volume: 1 });

  model.adjustPlaybackVolume(0.4);
  model.commitPlaybackVolume();
  assert.equal(mod.readShareVolume(model).volume, 0.4);
  model.togglePlaybackMuted();
  assert.equal(mod.readShareVolume(model).volume, 0);
  model.togglePlaybackMuted();
  assert.equal(mod.readShareVolume(model).volume, 0.4);
  assert.ok(changes > before);

  stop();
  assert.equal(model.playbackVolume$.listeners.size, 0);
  assert.equal(model.audioEnabled$.listeners.size, 0);
});

test('a share without sound, and odd values, are reported safely', () => {
  const model = shareVm({ audio: false });
  assert.equal(mod.readShareVolume(model).hasAudio, false);
  model.playbackVolume$.next(1.7);
  assert.equal(mod.readShareVolume(model).volume, 1);
  model.playbackVolume$.next(Number.NaN);
  assert.equal(mod.readShareVolume(model).volume, 0);
});

// The hooks above, in the Element Call build Diddy ships: if an update renames them, this fails
// instead of the menu silently losing its slider.
test('the shipped Element Call still has the share volume hooks', () => {
  const dist = path.join(
    __dirname,
    '../node_modules/@element-hq/element-call-embedded/dist/assets'
  );
  const js = fs
    .readdirSync(dist)
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  // the spotlight item passes its model on and puts the model's id on the media tile
  assert.ok(/\{ref:\w+,"data-id":\w+\.id,className:/.test(js), 'SpotlightItem data-id');
  assert.ok(/\(\w+,\{vm:\w+,\.\.\.\w+\}\)\};\w+\.displayName=`SpotlightItem`/.test(js), 'vm prop');
  // remote screen share model: its type, not local, volume sink on the screen-share audio
  assert.ok(js.includes('type:`screen share`'), 'screen share type');
  assert.ok(/setVolume\(\w+,\w+\.Source\.ScreenShareAudio\)/.test(js), 'screen share sink');
  // the playback volume API (also what Element Call's own slider uses)
  for (const name of [
    'playbackVolume$:',
    'togglePlaybackMuted:',
    'adjustPlaybackVolume:',
    'commitPlaybackVolume:',
  ]) {
    assert.ok(js.includes(name), `${name} missing`);
  }
  // behaviours are read through `.value`
  assert.ok(
    /useSyncExternalStore\)\(.{0,120}useCallback\)\(\(\)=>\w+\.value,/.test(js),
    'behaviour value'
  );
  assert.ok(js.includes('__reactFiber$'), 'React fiber key changed');
});
