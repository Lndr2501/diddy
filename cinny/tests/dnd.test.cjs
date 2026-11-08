// Issue #71: Do not disturb silences sounds and system notifications, follows the synced profile
// status and is shown to other people.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const src = (file) => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8');

function loadDnd() {
  const code = ts.transpileModule(src('plugins/diddy/dnd.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (id) => {
      throw new Error(`dnd.ts must stay free of imports, got ${id}`);
    },
  });
  return exports;
}

const dnd = loadDnd();
const plain = (v) => JSON.parse(JSON.stringify(v));

test('DND is announced as online with the DND status message', () => {
  assert.deepEqual(plain(dnd.presenceForStatus('dnd')), {
    presence: 'online',
    statusMsg: dnd.DND_STATUS_MSG,
  });
  assert.deepEqual(plain(dnd.presenceForStatus('online')), { presence: 'online' });
  assert.deepEqual(plain(dnd.presenceForStatus('idle')), { presence: 'unavailable' });
  assert.deepEqual(plain(dnd.presenceForStatus('invisible')), { presence: 'offline' });
});

test('the synced profile status wins over this device', () => {
  // DND picked in the profile settings or on another device: localStorage still says online
  assert.equal(dnd.resolveMyStatus('dnd', 'online'), 'dnd');
  assert.equal(dnd.resolveMyStatus('online', 'dnd'), 'online');
  // no Diddy room: this device's copy is all there is
  assert.equal(dnd.resolveMyStatus(undefined, 'dnd'), 'dnd');
  assert.equal(dnd.resolveMyStatus(undefined, 'online'), 'online');
});

test('only DND silences alerts', () => {
  assert.equal(dnd.silencesAlerts('dnd'), true);
  assert.equal(dnd.silencesAlerts('online'), false);
  assert.equal(dnd.silencesAlerts('idle'), false);
  assert.equal(dnd.silencesAlerts('invisible'), false);
});

test('others are shown as DND from their profile or their status message', () => {
  assert.equal(dnd.isShownAsDnd('dnd', undefined), true);
  assert.equal(dnd.isShownAsDnd(undefined, 'Do not disturb'), true);
  assert.equal(dnd.isShownAsDnd(undefined, '  Do not disturb '), true);
  assert.equal(dnd.isShownAsDnd(undefined, 'In a meeting'), false);
  assert.equal(dnd.isShownAsDnd(undefined, undefined), false);
  // the profile is newer than a leftover status message
  assert.equal(dnd.isShownAsDnd('online', 'Do not disturb'), false);
});

test('every notification and ring path asks isDoNotDisturb, not the device copy', () => {
  const features = src('pages/client/ClientNonUIFeatures.tsx');
  assert.equal((features.match(/if \(isDoNotDisturb\(mx\)\) return;/g) ?? []).length, 2);
  assert.doesNotMatch(features, /getLocalStatus\(\)/);
  assert.match(src('components/CallEmbedProvider.tsx'), /isDoNotDisturb\(mx\)/);
});

test('the status sync follows profile changes', () => {
  const status = src('plugins/diddy/status.ts');
  assert.match(status, /export const isDoNotDisturb/);
  // the effect that announces presence re-runs when the profile status changes
  assert.match(status, /\}, \[mx, profileStatus\]\);/);
});
