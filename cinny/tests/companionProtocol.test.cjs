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
    { requestId: 'r1', deviceId: 'PHONE', joined: true, background: false, beats: false, media: { camera: true, microphone: false, screen: false } }
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
  // the iPhone left by itself: the computer says so instead of switching back silently
  const left = mod.applyCompanionState(joined, { requestId: 'r1', deviceId: 'PHONE', joined: false, media: {} });
  assert.equal(left.phase, 'ended');
  assert.equal(left.endReason, 'left');
  // nothing more comes in after that
  assert.equal(mod.applyCompanionState(left, { requestId: 'r1', deviceId: 'PHONE', joined: true, media: {} }), left);
  assert.equal(mod.applyCompanionState(waiting, { requestId: 'r1', deviceId: 'PHONE', joined: false, media: {} }).phase, 'declined');
});

test('answers to other requests or from a second phone change nothing', () => {
  assert.equal(mod.applyCompanionState(waiting, { requestId: 'old', deviceId: 'P', joined: true, media: {} }), waiting);
  const joined = mod.applyCompanionState(waiting, { requestId: 'r1', deviceId: 'PHONE', joined: true, media: {} });
  assert.equal(mod.applyCompanionState(joined, { requestId: 'r1', deviceId: 'IPAD', joined: false, media: {} }), joined);
  assert.equal(mod.applyCompanionState(mod.IDLE, { requestId: 'r1', deviceId: 'P', joined: true, media: {} }), mod.IDLE);
});

test('the phone in the background and a phone that went silent', () => {
  const waiting = { phase: 'waiting', requestId: 'r1', roomId: '!a:b', wanted: { camera: true, microphone: true, screen: false } };
  const media = { camera: true, microphone: true, screen: false };
  const bg = mod.applyCompanionState(waiting, { requestId: 'r1', deviceId: 'PHONE', joined: true, background: true, beats: true, media });
  assert.equal(bg.phoneBackground, true);
  const back = mod.applyCompanionState(bg, { requestId: 'r1', deviceId: 'PHONE', joined: true, background: false, beats: true, media });
  assert.equal(back.phoneBackground, false);
  // "still here" with nothing new keeps the same snapshot (no redraw every 20 s)
  assert.equal(mod.applyCompanionState(back, { requestId: 'r1', deviceId: 'PHONE', joined: true, background: false, media: { ...media } }), back);
  assert.equal(mod.parseCompanionState({ v: 1, request_id: 'r', device_id: 'P', joined: true, background: true }).background, true);

  const t = 1_000_000;
  assert.equal(mod.companionLost(back, t, t + mod.COMPANION_LOST_MS - 1), false);
  assert.equal(mod.companionLost(back, t, t + mod.COMPANION_LOST_MS + 1), true);
  // an older phone never says it is there: it is never called lost
  const old = mod.applyCompanionState(waiting, mod.parseCompanionState({ v: 1, request_id: 'r1', device_id: 'PHONE', joined: true, camera: true }));
  assert.equal(old.phase, 'connected');
  assert.equal(mod.companionLost(old, t, t + mod.COMPANION_LOST_MS * 10), false);
  // only a connected phone can get lost
  assert.equal(mod.companionLost(waiting, t, t + mod.COMPANION_LOST_MS * 2), false);
  // the phone says it is there clearly more often than it takes to call it lost
  assert.ok(mod.COMPANION_HEARTBEAT_MS * 3 <= mod.COMPANION_LOST_MS);
});
