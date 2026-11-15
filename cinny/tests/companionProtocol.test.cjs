// "Use iPhone as Camera & Mic": the computer's side of the messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/companionProtocol.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const plain = (v) => JSON.parse(JSON.stringify(v));

const waiting = {
  phase: 'waiting',
  requestId: 'r1',
  roomId: '!a:hs',
  wanted: { camera: true, microphone: true, screen: false },
};

test('the request carries room, computer and what to send', () => {
  assert.deepEqual(
    plain(mod.makeCompanionRequest('r1', '!a:hs', 'Gaming', 'DESK', { camera: true, microphone: false, screen: true })),
    { v: 1, request_id: 'r1', room_id: '!a:hs', room_name: 'Gaming', device_id: 'DESK', camera: true, microphone: false, screen: true }
  );
  assert.deepEqual(plain(mod.makeCompanionControl('r1', { microphone: false })), { v: 1, request_id: 'r1', microphone: false });
});

test('the phone answer is read strictly', () => {
  assert.deepEqual(
    plain(mod.parseCompanionState({ v: 1, request_id: 'r1', device_id: 'PHONE', joined: true, camera: true, microphone: 'yes' })),
    { requestId: 'r1', deviceId: 'PHONE', joined: true, media: { camera: true, microphone: false, screen: false } }
  );
  assert.equal(mod.parseCompanionState({ v: 2, request_id: 'r1', device_id: 'P' }), undefined);
  assert.equal(mod.parseCompanionState({ v: 1, device_id: 'P' }), undefined);
  assert.equal(mod.parseCompanionState(null), undefined);
});

test('joining connects, leaving ends, declining says so', () => {
  const joined = mod.applyCompanionState(waiting, {
    requestId: 'r1', deviceId: 'PHONE', joined: true, media: { camera: true, microphone: true, screen: false },
  });
  assert.equal(joined.phase, 'connected');
  assert.equal(joined.phoneDeviceId, 'PHONE');
  const updated = mod.applyCompanionState(joined, {
    requestId: 'r1', deviceId: 'PHONE', joined: true, media: { camera: false, microphone: true, screen: false },
  });
  assert.equal(updated.phone.camera, false);
  assert.equal(mod.applyCompanionState(joined, { requestId: 'r1', deviceId: 'PHONE', joined: false, media: {} }).phase, 'idle');
  assert.equal(mod.applyCompanionState(waiting, { requestId: 'r1', deviceId: 'PHONE', joined: false, media: {} }).phase, 'declined');
});

test('answers to other requests or from a second phone change nothing', () => {
  assert.equal(mod.applyCompanionState(waiting, { requestId: 'old', deviceId: 'P', joined: true, media: {} }), waiting);
  const joined = mod.applyCompanionState(waiting, { requestId: 'r1', deviceId: 'PHONE', joined: true, media: {} });
  assert.equal(mod.applyCompanionState(joined, { requestId: 'r1', deviceId: 'IPAD', joined: false, media: {} }), joined);
  assert.equal(mod.applyCompanionState(mod.IDLE, { requestId: 'r1', deviceId: 'P', joined: true, media: {} }), mod.IDLE);
});
