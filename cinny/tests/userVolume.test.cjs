// #103: the volume / mute for me you give a person in a call is remembered per Matrix user.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const load = (file, requireFn) => {
  const filename = path.join(__dirname, '../src/app/plugins/call', file);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    output,
    { exports, require: requireFn, setTimeout, clearTimeout },
    { filename }
  );
  return exports;
};
const memory = load('volumeMemory.ts', () => ({}));
const mod = load('userVolume.ts', (id) => {
  if (id === './volumeMemory') return memory;
  throw new Error(id);
});
const plain = (value) => JSON.parse(JSON.stringify(value));

const KEY = 'diddyUserVolumes';

const memoryStorage = (initial) => {
  const data = new Map(initial ? [[KEY, JSON.stringify(initial)]] : []);
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
    saved: () => JSON.parse(data.get(KEY) ?? '{}'),
    raw: () => data.get(KEY),
    data,
  };
};

// --- the store -------------------------------------------------------------------------------

test('set and get a volume per person', () => {
  const s = memoryStorage();
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 0.4, muted: false });
  memory.rememberVolume(s, KEY, '@b:x.org', { volume: 0.7, muted: true });
  assert.deepEqual(plain(memory.rememberedVolume(s, KEY, '@a:x.org')), { volume: 0.4, muted: false });
  assert.deepEqual(plain(memory.rememberedVolume(s, KEY, '@b:x.org')), { volume: 0.7, muted: true });
  assert.equal(memory.rememberedVolume(s, KEY, '@c:x.org'), undefined);
});

test('100 % and not muted is the default and is not stored', () => {
  const s = memoryStorage();
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 1, muted: false });
  assert.equal(s.raw(), undefined);
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 0.5, muted: false });
  memory.rememberVolume(s, KEY, '@b:x.org', { volume: 0.5, muted: false });
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 1, muted: false });
  assert.deepEqual(s.saved(), { '@b:x.org': { volume: 0.5, muted: false } });
  memory.rememberVolume(s, KEY, '@b:x.org', { volume: 1, muted: false });
  assert.equal(s.raw(), undefined);
  // muted at 100 % is not the default
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 1, muted: true });
  assert.deepEqual(s.saved(), { '@a:x.org': { volume: 1, muted: true } });
});

test('levels are clamped to Element Call slider range', () => {
  const s = memoryStorage();
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 7, muted: true });
  assert.deepEqual(s.saved()['@a:x.org'], { volume: 1, muted: true });
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 0.123456, muted: false });
  assert.deepEqual(s.saved()['@a:x.org'], { volume: 0.12, muted: false });
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 0.001, muted: false });
  assert.deepEqual(s.saved()['@a:x.org'], { volume: 0.01, muted: false });
  // no usable level: back to the default
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: Number.NaN, muted: false });
  assert.equal(s.raw(), undefined);
  assert.equal(memory.validLevel(-1), undefined);
  assert.equal(memory.validLevel(0), undefined);
  assert.equal(memory.validLevel(null), undefined);
  assert.equal(memory.validLevel('0.5'), 0.5);
  // stored garbage is dropped on read
  const odd = memoryStorage({
    '@a:x.org': { volume: 'loud' },
    '@b:x.org': { volume: 3, muted: 'yes' },
    nobody: { volume: 0.5 },
  });
  assert.deepEqual(plain(memory.readVolumes(odd, KEY)), { '@b:x.org': { volume: 1, muted: false } });
  // not a Matrix id: never stored
  memory.rememberVolume(s, KEY, 'nobody', { volume: 0.5, muted: false });
  assert.equal(s.raw(), undefined);
});

test('only the most recently used people are kept (LRU)', () => {
  const s = memoryStorage();
  memory.rememberVolume(s, KEY, '@a:x.org', { volume: 0.1, muted: false }, 3);
  memory.rememberVolume(s, KEY, '@b:x.org', { volume: 0.2, muted: false }, 3);
  memory.rememberVolume(s, KEY, '@c:x.org', { volume: 0.3, muted: false }, 3);
  // meeting @a again makes them the most recent one
  memory.touchVolume(s, KEY, '@a:x.org');
  memory.rememberVolume(s, KEY, '@d:x.org', { volume: 0.4, muted: false }, 3);
  assert.deepEqual(Object.keys(s.saved()), ['@c:x.org', '@a:x.org', '@d:x.org']);
  // changing a volume also counts as use
  memory.rememberVolume(s, KEY, '@c:x.org', { volume: 0.35, muted: false }, 3);
  memory.rememberVolume(s, KEY, '@e:x.org', { volume: 0.5, muted: false }, 3);
  assert.deepEqual(Object.keys(s.saved()), ['@d:x.org', '@c:x.org', '@e:x.org']);
  assert.equal(memory.MAX_REMEMBERED, 500);
  const big = memoryStorage();
  for (let i = 0; i < 510; i += 1) {
    memory.rememberVolume(big, KEY, `@u${i}:x.org`, { volume: 0.5, muted: false });
  }
  const keys = Object.keys(big.saved());
  assert.equal(keys.length, 500);
  assert.equal(keys[0], '@u10:x.org');
});

test('reset forgets voices and screen shares, and broken storage never throws', () => {
  const s = memoryStorage({ '@a:x.org': { volume: 0.2, muted: false } });
  s.setItem('diddyStreamVolumes', JSON.stringify({ '@a:x.org': { volume: 0.3, muted: false } }));
  s.setItem('other', 'kept');
  memory.clearAllCallVolumes(s);
  assert.equal(s.getItem(KEY), null);
  assert.equal(s.getItem('diddyStreamVolumes'), null);
  assert.equal(s.getItem('other'), 'kept');
  const throwing = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  memory.rememberVolume(throwing, KEY, '@a:x.org', { volume: 0.5, muted: false });
  memory.touchVolume(throwing, KEY, '@a:x.org');
  memory.clearAllCallVolumes(throwing);
  memory.clearAllCallVolumes(undefined);
  assert.deepEqual(plain(memory.readVolumes(throwing, KEY)), {});
  assert.deepEqual(plain(memory.readVolumes({ getItem: () => '{x', setItem() {} }, KEY)), {});
});

// --- Element Call's view model of a remote person -------------------------------------------

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

/** RemoteUserMediaViewModel (the parts Diddy uses), with Element Call's VolumeControls logic. */
const userVm = ({ userId = '@gho:x.org', local = false, type = 'user' } = {}) => {
  const state = { volume: 1, committed: 1 };
  const volume$ = behavior(1);
  return {
    id: `${userId}:DEVICE`,
    userId,
    type,
    local,
    playbackVolume$: volume$,
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

/** Timers run by hand. */
const fakeTimers = () => {
  const pending = new Map();
  let next = 1;
  return {
    setTimer: (fn) => {
      const id = next;
      next += 1;
      pending.set(id, fn);
      return id;
    },
    clearTimer: (id) => pending.delete(id),
    flush: () => {
      const fns = Array.from(pending.values());
      pending.clear();
      fns.forEach((fn) => fn());
    },
    size: () => pending.size,
  };
};

test('a person met again gets the volume remembered for them, once per appearance', () => {
  const storage = memoryStorage({ '@gho:x.org': { volume: 0.3, muted: false } });
  const timers = fakeTimers();
  const model = userVm();
  mod.trackUserVolume(model, { storage, ...timers });
  assert.equal(model.playbackVolume$.value, 0.3);
  // restoring writes nothing new
  timers.flush();
  assert.deepEqual(storage.saved(), { '@gho:x.org': { volume: 0.3, muted: false } });
  // what you change while they are there is never overridden by a later sync
  model.adjustPlaybackVolume(0.8);
  mod.trackUserVolume(model, { storage, ...timers });
  assert.equal(model.playbackVolume$.value, 0.8);
  // nobody remembered: Element Call's 100 % stays
  const other = userVm({ userId: '@b:x.org' });
  mod.trackUserVolume(other, { storage, ...timers });
  assert.equal(other.playbackVolume$.value, 1);
});

test('changes in the Element Call menu are remembered after the slider rests', () => {
  const storage = memoryStorage();
  const timers = fakeTimers();
  const model = userVm();
  mod.trackUserVolume(model, { storage, ...timers });
  // dragging: many values, one write
  model.adjustPlaybackVolume(0.9);
  model.adjustPlaybackVolume(0.6);
  model.adjustPlaybackVolume(0.45);
  model.commitPlaybackVolume();
  assert.equal(timers.size(), 1);
  assert.equal(storage.raw(), undefined);
  timers.flush();
  assert.deepEqual(storage.saved(), { '@gho:x.org': { volume: 0.45, muted: false } });

  // mute for me: remembered at the level unmute returns to
  model.togglePlaybackMuted();
  timers.flush();
  assert.deepEqual(storage.saved(), { '@gho:x.org': { volume: 0.45, muted: true } });
  model.togglePlaybackMuted();
  timers.flush();
  assert.deepEqual(storage.saved(), { '@gho:x.org': { volume: 0.45, muted: false } });

  // back to 100 %: the default, nothing stored any more
  model.adjustPlaybackVolume(1);
  model.commitPlaybackVolume();
  timers.flush();
  assert.equal(storage.raw(), undefined);
});

test('the next call (new model) starts muted at the remembered level', () => {
  const storage = memoryStorage();
  const timers = fakeTimers();
  const first = userVm();
  mod.trackUserVolume(first, { storage, ...timers });
  first.adjustPlaybackVolume(0.25);
  first.commitPlaybackVolume();
  first.togglePlaybackMuted();
  timers.flush();
  // they leave; later a new model for the same person (another device even)
  const again = userVm();
  again.id = '@gho:x.org:OTHERDEVICE';
  mod.trackUserVolume(again, { storage, ...timers });
  assert.equal(again.playbackVolume$.value, 0);
  again.togglePlaybackMuted();
  assert.equal(again.playbackVolume$.value, 0.25);
});

test('dragged down to nothing: muted at the level before the drag', () => {
  const storage = memoryStorage({ '@gho:x.org': { volume: 0.6, muted: false } });
  const timers = fakeTimers();
  const model = userVm();
  mod.trackUserVolume(model, { storage, ...timers });
  [0.5, 0.3, 0.1, 0.04, 0].forEach((v) => model.adjustPlaybackVolume(v));
  model.commitPlaybackVolume();
  timers.flush();
  assert.deepEqual(storage.saved(), { '@gho:x.org': { volume: 0.6, muted: true } });
});

test('a pending change is saved when tracking stops', () => {
  const storage = memoryStorage();
  const timers = fakeTimers();
  const model = userVm();
  mod.trackUserVolume(model, { storage, ...timers });
  model.adjustPlaybackVolume(0.5);
  mod.untrackUserVolume(model);
  assert.deepEqual(storage.saved(), { '@gho:x.org': { volume: 0.5, muted: false } });
  assert.equal(model.playbackVolume$.listeners.size, 0);
});

// --- finding the models in the call document --------------------------------------------------

const tileWith = (model, { label, depth = 4, key = '__reactFiber$abc', between } = {}) => {
  let fiber = { memoizedProps: { vm: model } };
  if (between) fiber = { memoizedProps: { vm: between }, return: fiber };
  for (let i = 0; i < depth; i += 1) fiber = { memoizedProps: { className: 'x' }, return: fiber };
  const shown = label ?? model?.userId;
  return {
    [key]: fiber,
    getAttribute: () => null,
    querySelector: (sel) =>
      sel === '[aria-label]' && shown ? { getAttribute: () => shown } : null,
  };
};

test('finds remote people through the React props of their tiles', () => {
  const a = userVm({ userId: '@a:x.org' });
  const b = userVm({ userId: '@b:x.org' });
  assert.equal(mod.userVmOfTile(tileWith(a)), a);
  // yourself, a screen share, no fiber, too deep, wrong user: never
  assert.equal(mod.userVmOfTile(tileWith(userVm({ local: true }))), undefined);
  assert.equal(mod.userVmOfTile(tileWith(userVm({ type: 'screen share' }))), undefined);
  assert.equal(mod.userVmOfTile(tileWith(a, { key: 'other' })), undefined);
  assert.equal(mod.userVmOfTile(tileWith(a, { depth: 40 })), undefined);
  assert.equal(mod.userVmOfTile(tileWith(a, { label: '@b:x.org' })), undefined);
  // the nearest model is the tile's own: a person's model further up is not taken
  const share = userVm({ type: 'screen share' });
  assert.equal(mod.userVmOfTile(tileWith(a, { between: share })), undefined);
  assert.equal(mod.userVmOfTile(null), undefined);
  assert.equal(mod.isUserVolumeVm({ ...a, commitPlaybackVolume: undefined }), false);

  // the same person in grid and spotlight: one model, tracked once
  const doc = {
    querySelectorAll: (sel) => {
      assert.equal(sel, '[data-testid="videoTile"]');
      return [tileWith(a), tileWith(a), tileWith(b)];
    },
  };
  const found = mod.findUserVolumeVms(doc);
  assert.equal(found.length, 2);
  assert.equal(found[0], a);
  assert.equal(found[1], b);
  assert.equal(mod.findUserVolumeVms(null).length, 0);

  const storage = memoryStorage({ '@b:x.org': { volume: 0.2, muted: false } });
  mod.syncUserVolumes(doc, { storage, ...fakeTimers() });
  assert.equal(b.playbackVolume$.value, 0.2);
  assert.equal(a.playbackVolume$.value, 1);
});

// The hooks above, in the Element Call build Diddy ships: if an update renames them, this fails.
test('the shipped Element Call still has the per-person volume hooks', () => {
  const dist = path.join(__dirname, '../node_modules/@element-hq/element-call-embedded/dist/assets');
  const js = fs
    .readdirSync(dist)
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => fs.readFileSync(path.join(dist, f), 'utf8'))
    .join('\n');
  assert.ok(js.includes('type:`user`'), 'user media type');
  // the remote person's volume goes to LiveKit's participant volume (microphone)
  assert.ok(/=>\w+=>\w+\?\.setVolume\(\w+\)\)\)\)\}\),local:!1/.test(js), 'remote user sink');
  for (const name of [
    'playbackVolume$:',
    'togglePlaybackMuted:',
    'adjustPlaybackVolume:',
    'commitPlaybackVolume:',
  ]) {
    assert.ok(js.includes(name), `${name} missing`);
  }
  assert.ok(js.includes('"data-testid":`videoTile`'), 'tile');
  assert.ok(js.includes('__reactFiber$'), 'React fiber key changed');
});
