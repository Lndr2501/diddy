// The lock in the call panel: encrypted or not, and whether everyone's media key has arrived.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/callEncryption.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, Set });

const base = {
  encrypted: true,
  ownUserId: '@me:hs',
  ownDeviceId: 'DESK',
  livekit: true,
};
const members = [
  { sender: '@me:hs', deviceId: 'DESK' },
  { sender: '@me:hs', deviceId: 'PHONE' },
  { sender: '@a:hs', deviceId: 'A1' },
];

const plain = (value) => JSON.parse(JSON.stringify(value));

test('an unencrypted room is an unencrypted call', () => {
  const state = mod.callEncryption({ ...base, encrypted: false, members, keyed: new Set() });
  assert.deepEqual(plain(state), { kind: 'off' });
  assert.match(mod.callEncryptionLabel(state), /^Not encrypted/);
});

test('all keys there, own device not needed, own iPhone counted', () => {
  const state = mod.callEncryption({
    ...base,
    members,
    keyed: new Set(['@me:hs:PHONE', '@a:hs:A1']),
  });
  assert.deepEqual(plain(state), { kind: 'on', keysKnown: true });
  assert.match(mod.callEncryptionLabel(state), /Everyone's key has arrived/);
});

test('missing keys are counted per device', () => {
  const state = mod.callEncryption({
    ...base,
    members: [...members, { sender: '@a:hs', deviceId: 'A1' }],
    keyed: new Set(['@a:hs:A1']),
  });
  assert.deepEqual(plain(state), { kind: 'waiting', missing: 1 });
  assert.match(mod.callEncryptionLabel(state), /key of 1 device;/);
  const two = mod.callEncryption({ ...base, members, keyed: new Set() });
  assert.deepEqual(plain(two), { kind: 'waiting', missing: 2 });
  assert.match(mod.callEncryptionLabel(two), /key of 2 devices/);
});

test('without a LiveKit worker only "encrypted" is known', () => {
  const state = mod.callEncryption({ ...base, livekit: false, members, keyed: new Set() });
  assert.deepEqual(plain(state), { kind: 'on', keysKnown: false });
  assert.equal(mod.callEncryptionLabel(state), 'End-to-end encrypted');
});

test('memberships without sender or device are skipped', () => {
  const state = mod.callEncryption({
    ...base,
    members: [{ sender: '@a:hs' }, { deviceId: 'X' }],
    keyed: new Set(),
  });
  assert.deepEqual(plain(state), { kind: 'on', keysKnown: true });
});
