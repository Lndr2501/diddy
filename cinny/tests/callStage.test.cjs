// Diddy's call stage reads people and screen shares from Element Call's media tiles.
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

const frameMenuFile = path.join(__dirname, '../src/app/plugins/callFrameMenu.ts');
const stageFile = path.join(__dirname, '../src/app/plugins/call/callStage.ts');

function load() {
  const frameMenu = {};
  vm.runInNewContext(compile(frameMenuFile), {
    exports: frameMenu,
    require: () => ({ describeElement: () => 'el' }),
  });
  const mod = {};
  vm.runInNewContext(compile(stageFile), {
    exports: mod,
    require: (id) => {
      if (id === '../callFrameMenu') return frameMenu;
      throw new Error(id);
    },
  });
  return mod;
}

const stream = (id, { live = true, muted = false } = {}) => ({
  id,
  getVideoTracks: () => [{ readyState: live ? 'live' : 'ended', muted }],
});

// A fake Element Call media tile: owner label, name tag, optional video, speaking / muted.
const tile = ({ userId, name, dataId, video, width = 1280, speaking, muted }) => {
  const parts = {
    '[aria-label]': { getAttribute: () => userId },
    '[data-testid="name_tag"]': { textContent: ` ${name} ` },
    video: video ? { srcObject: video, videoWidth: width } : null,
    '[data-muted="true"]': muted ? {} : null,
  };
  return {
    className: `_media_x_1 _tile_y_2${speaking ? ' _speaking_ghafa_28' : ''}`,
    getAttribute: (name_) => (name_ === 'data-id' ? dataId ?? null : null),
    querySelector: (sel) => parts[sel] ?? null,
  };
};

const doc = (tiles) => ({ querySelectorAll: () => tiles });

test('people and screen shares become separate stage items', () => {
  const { readCallStage } = load();
  const cam = stream('cam-oeb');
  const share = stream('share-oeb');
  const model = readCallStage(
    doc([
      tile({
        userId: '@oeb:x.eu',
        name: 'oeb',
        dataId: '@oeb:x.eu:DEV:0:screen-share',
        video: share,
        width: 1920,
      }),
      tile({ userId: '@oeb:x.eu', name: 'oeb', video: cam }),
      tile({ userId: '@music:x.eu', name: 'music', speaking: true, muted: true }),
    ])
  );
  assert.deepEqual(
    [...model.people].map((p) => [p.userId, p.name, p.speaking, p.muted, p.video?.id]),
    [
      ['@oeb:x.eu', 'oeb', false, false, 'cam-oeb'],
      ['@music:x.eu', 'music', true, true, undefined],
    ]
  );
  assert.deepEqual(
    [...model.shares].map((s) => [s.id, s.userId, s.name, s.video?.id]),
    [['@oeb:x.eu:DEV:0:screen-share', '@oeb:x.eu', 'oeb', 'share-oeb']]
  );
});

test('a camera that is off or sends no pictures shows the avatar instead', () => {
  const { readCallStage } = load();
  const model = readCallStage(
    doc([
      tile({ userId: '@a:x.eu', name: 'a', video: stream('m', { muted: true }) }),
      tile({ userId: '@b:x.eu', name: 'b', video: stream('e', { live: false }) }),
      tile({ userId: '@c:x.eu', name: 'c', video: stream('z'), width: 0 }),
    ])
  );
  assert.deepEqual(
    [...model.people].map((p) => p.video),
    [undefined, undefined, undefined]
  );
});

test('two tiles of one person (spotlight and grid) are merged into one', () => {
  const { readCallStage } = load();
  const model = readCallStage(
    doc([
      tile({ userId: '@a:x.eu', name: 'a', dataId: '@a:x.eu:DEV:0' }),
      tile({ userId: '@a:x.eu', name: 'a', speaking: true, video: stream('cam') }),
    ])
  );
  assert.equal(model.people.length, 1);
  assert.equal(model.people[0].speaking, true);
  assert.equal(model.people[0].video.id, 'cam');
});

test('tiles without a Matrix ID owner are ignored, no document means an empty stage', () => {
  const { readCallStage } = load();
  const model = readCallStage(doc([tile({ userId: 'not an id', name: 'x' })]));
  assert.deepEqual(model.people.length + model.shares.length, 0);
  const empty = readCallStage(undefined);
  assert.deepEqual([empty.people.length, empty.shares.length], [0, 0]);
});

test('the signature changes with what the stage shows', () => {
  const { readCallStage, stageSignature } = load();
  const quiet = readCallStage(doc([tile({ userId: '@a:x.eu', name: 'a' })]));
  const speaking = readCallStage(doc([tile({ userId: '@a:x.eu', name: 'a', speaking: true })]));
  assert.notEqual(stageSignature(quiet), stageSignature(speaking));
  assert.equal(
    stageSignature(quiet),
    stageSignature(readCallStage(doc([tile({ userId: '@a:x.eu', name: 'a' })])))
  );
});

// #76: your own ring comes from Diddy's microphone level, Element Call leaves it off.
test('markSpeaking rings you while Diddy hears you, unless your tile shows you muted', () => {
  const { readCallStage, markSpeaking, stageSpeakers } = load();
  const me = '@me:x.eu';
  const model = readCallStage(
    doc([tile({ userId: me, name: 'me' }), tile({ userId: '@b:x.eu', name: 'b', speaking: true })])
  );
  assert.deepEqual([...stageSpeakers(model)], ['@b:x.eu']);

  const marked = markSpeaking(model, me, true);
  assert.deepEqual([...stageSpeakers(marked)].sort(), ['@b:x.eu', me].sort());
  // the input model is left alone
  assert.equal(model.people[0].speaking, false);

  // not speaking, no user id, not on the stage: the same model
  assert.equal(markSpeaking(model, me, false), model);
  assert.equal(markSpeaking(model, undefined, true), model);
  assert.equal(markSpeaking(model, '@nobody:x.eu', true), model);

  const muted = readCallStage(doc([tile({ userId: me, name: 'me', muted: true })]));
  assert.equal(markSpeaking(muted, me, true), muted);
  assert.equal(stageSpeakers(muted).size, 0);
});

test('markSpeaking never clears a ring Element Call shows', () => {
  const { readCallStage, markSpeaking, stageSpeakers } = load();
  const model = readCallStage(doc([tile({ userId: '@me:x.eu', name: 'me', speaking: true })]));
  assert.deepEqual([...stageSpeakers(markSpeaking(model, '@me:x.eu', false))], ['@me:x.eu']);
});
