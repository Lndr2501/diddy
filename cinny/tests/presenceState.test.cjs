// One presence state for every view: DM list, room header, member list, profile card (#72, #73).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/utils/presenceState.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });

const SEEN = 1700000000000;
const resolve = (input) => mod.resolvePresenceState(input);

test('plain Matrix presence maps to online, idle and offline', () => {
  assert.equal(resolve({ presence: 'online', lastActiveTs: SEEN }), 'online');
  assert.equal(resolve({ presence: 'unavailable', lastActiveTs: SEEN }), 'idle');
  assert.equal(resolve({ presence: 'offline', lastActiveTs: SEEN }), 'offline');
});

test('no presence information is unknown, not offline', () => {
  assert.equal(resolve(undefined), undefined);
  assert.equal(resolve({}), undefined);
  assert.equal(resolve({ presence: 'offline', lastActiveTs: 0 }), undefined);
  assert.equal(resolve({ presence: 'offline' }), undefined);
  assert.equal(resolve({ presence: 'weird', lastActiveTs: SEEN }), undefined);
  // a picked status alone does not say whether the user is connected
  assert.equal(resolve({ presence: 'offline', lastActiveTs: 0, chosen: 'dnd' }), undefined);
});

test('#73: DND is published as Matrix "online" and must not show as online', () => {
  // the profile is readable: the picked status wins
  assert.equal(resolve({ presence: 'online', lastActiveTs: SEEN, chosen: 'dnd' }), 'dnd');
  // the profile is not readable (no shared options room): the status message still says so
  assert.equal(
    resolve({ presence: 'online', lastActiveTs: SEEN, statusMsg: mod.DND_STATUS_MSG }),
    'dnd'
  );
  assert.equal(
    resolve({ presence: 'online', lastActiveTs: SEEN, statusMsg: ' do not disturb ' }),
    'dnd'
  );
  assert.equal(resolve({ presence: 'unavailable', lastActiveTs: SEEN, chosen: 'dnd' }), 'dnd');
});

test('offline Matrix presence wins over an older picked status', () => {
  assert.equal(resolve({ presence: 'offline', lastActiveTs: SEEN, chosen: 'dnd' }), 'offline');
  assert.equal(resolve({ presence: 'offline', lastActiveTs: SEEN, chosen: 'online' }), 'offline');
  assert.equal(
    resolve({ presence: 'offline', lastActiveTs: SEEN, statusMsg: mod.DND_STATUS_MSG }),
    'offline'
  );
});

test('picked status refines a connected user', () => {
  assert.equal(resolve({ presence: 'online', lastActiveTs: SEEN, chosen: 'invisible' }), 'offline');
  assert.equal(resolve({ presence: 'online', lastActiveTs: SEEN, chosen: 'idle' }), 'idle');
  assert.equal(resolve({ presence: 'online', lastActiveTs: SEEN, chosen: 'online' }), 'online');
  // Matrix says away (e.g. the server marked the user idle): idle even if the pick was online
  assert.equal(resolve({ presence: 'unavailable', lastActiveTs: SEEN, chosen: 'online' }), 'idle');
});

test('every state has one label and one color', () => {
  for (const state of ['online', 'idle', 'dnd', 'offline']) {
    assert.equal(typeof mod.PRESENCE_STATE_LABEL[state], 'string');
    assert.equal(typeof mod.PRESENCE_STATE_COLOR[state], 'string');
  }
  assert.equal(mod.PRESENCE_STATE_LABEL.dnd, 'Do not disturb');
  assert.equal(mod.PRESENCE_STATE_LABEL.online, 'Online');
  assert.equal(mod.PRESENCE_STATE_COLOR.dnd, 'Critical');
  assert.equal(mod.PRESENCE_STATE_COLOR.online, 'Success');
});

test('the DND marker is not shown as a custom status message', () => {
  assert.equal(mod.presenceMessage(mod.DND_STATUS_MSG), undefined);
  assert.equal(mod.presenceMessage('  '), undefined);
  assert.equal(mod.presenceMessage(undefined), undefined);
  assert.equal(mod.presenceMessage(' brb, lunch '), 'brb, lunch');
});

test('present means reachable: not offline and not unknown', () => {
  assert.equal(mod.isPresentState('online'), true);
  assert.equal(mod.isPresentState('idle'), true);
  assert.equal(mod.isPresentState('dnd'), true);
  assert.equal(mod.isPresentState('offline'), false);
  assert.equal(mod.isPresentState(undefined), false);
});
