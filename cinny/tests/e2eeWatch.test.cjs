// E2EE worker watch (issue #74: garbled screen share and harsh noise = frames reaching the decoder
// undecrypted, which LiveKit 2.19 does while a participant's encryption flag is not set).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/e2eeWatch.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const diagLines = [];
const exported = {};
vm.runInNewContext(
  output,
  {
    exports: exported,
    WeakMap,
    WeakSet,
    Map,
    Proxy,
    Reflect,
    Object,
    Date,
    require: (id) => {
      if (id !== '../diagnostics') throw new Error(`Unexpected dependency: ${id}`);
      return { diag: (line) => diagLines.push(line) };
    },
  },
  { filename }
);
const { E2eeTracker, installE2eeWatch } = exported;

const init = { kind: 'init', data: { keyProviderOptions: { ratchetWindowSize: 10, keyringSize: 256 } } };

const tracker = (now = () => 0) => {
  const lines = [];
  return { lines, t: new E2eeTracker((line) => lines.push(line), now) };
};

test('ignores workers that are not the LiveKit E2EE worker', () => {
  const { lines, t } = tracker();
  assert.equal(t.outgoing({ command: 'connect' }), undefined);
  assert.equal(t.outgoing({ kind: 'decode', data: { participantIdentity: 'a', trackId: 't' } }), undefined);
  assert.equal(t.transform({ kind: 'decode', participantIdentity: 'a', trackId: 't' }), undefined);
  t.incoming({ kind: 'error', data: { error: new Error('x') } });
  assert.deepEqual(lines, []);
});

test('a receiver for a participant with the flag on is only logged', () => {
  const { lines, t } = tracker();
  t.outgoing(init);
  t.outgoing({ kind: 'enable', data: { enabled: true, participantIdentity: 'alice' } });
  assert.equal(t.transform({ kind: 'decode', participantIdentity: 'alice', trackId: 'TR_1', codec: 'vp8' }), undefined);
  assert.match(lines.at(-1), /e2ee receive alice track=TR_1 codec=vp8$/);
});

test('a receiver without any flag gets decryption enabled (the garble path)', () => {
  const { lines, t } = tracker();
  t.outgoing(init);
  const action = t.outgoing({ kind: 'decode', data: { participantIdentity: 'bob', trackId: 'TR_2' } });
  assert.deepEqual({ ...action }, { enable: 'bob' });
  assert.equal(t.flag('bob'), true);
  assert.match(lines.at(-1), /WARNING: no encryption flag .*enabling decryption/);
  // the same participant's next track needs nothing more
  assert.equal(t.transform({ kind: 'decode', participantIdentity: 'bob', trackId: 'TR_3' }), undefined);
});

test('an explicit "off" from LiveKit is never overridden, only reported', () => {
  const { lines, t } = tracker();
  t.outgoing(init);
  t.outgoing({ kind: 'enable', data: { enabled: true, participantIdentity: 'carol' } });
  t.outgoing({ kind: 'enable', data: { enabled: false, participantIdentity: 'carol' } });
  assert.match(lines.at(-1), /e2ee flag carol=false \(was on/);
  assert.equal(t.transform({ kind: 'decode', participantIdentity: 'carol', trackId: 'TR_4' }), undefined);
  assert.equal(t.flag('carol'), false);
  assert.match(lines.at(-1), /WARNING: encryption flag is off/);
});

test('encode transforms and flag repeats stay quiet', () => {
  const { lines, t } = tracker();
  t.outgoing(init);
  const before = lines.length;
  assert.equal(t.transform({ kind: 'encode', participantIdentity: 'me', trackId: 'TR_5' }), undefined);
  t.outgoing({ kind: 'enable', data: { enabled: true, participantIdentity: 'me' } });
  t.outgoing({ kind: 'enable', data: { enabled: true, participantIdentity: 'me' } });
  assert.equal(lines.length, before + 1);
});

test('key changes are logged by index only, re-posts are skipped', () => {
  const { lines, t } = tracker();
  t.outgoing(init);
  const key = { secret: 'material' };
  t.outgoing({ kind: 'setKey', data: { participantIdentity: 'dave', key, keyIndex: 3, isPublisher: false } });
  assert.match(lines.at(-1), /e2ee key set for dave index=3 own=false/);
  assert.doesNotMatch(lines.join('\n'), /material/);
  const count = lines.length;
  t.outgoing({ kind: 'setKey', data: { participantIdentity: 'dave', key, keyIndex: 3, updateCurrentKeyIndex: false } });
  assert.equal(lines.length, count);
});

test('worker errors are throttled per message', () => {
  let now = 0;
  const { lines, t } = tracker(() => now);
  t.outgoing(init);
  const err = { kind: 'error', data: { error: new Error('MissingKey: missing key at index 2 for participant x') } };
  t.incoming(err);
  now = 1000;
  t.incoming(err);
  t.incoming(err);
  now = 12000;
  t.incoming(err);
  const errors = lines.filter((l) => l.startsWith('e2ee error'));
  assert.equal(errors.length, 2);
  assert.match(errors[1], /MissingKey.*\(\+2 more since last line\)/);
});

test('the installed hooks set a missing flag before the transform is created', () => {
  const posted = [];
  class FakeWorker {
    constructor() {
      this.listeners = [];
    }

    postMessage(msg) {
      posted.push(msg);
    }

    addEventListener(type, fn) {
      this.listeners.push(fn);
    }
  }
  const created = [];
  class FakeTransform {
    constructor(worker, options) {
      created.push({ worker, options, postedBefore: posted.length });
    }
  }
  const win = { Worker: FakeWorker, RTCRtpScriptTransform: FakeTransform };
  installE2eeWatch(win);
  installE2eeWatch(win); // idempotent
  const worker = new win.Worker('blob:x');
  assert.ok(worker instanceof FakeWorker);
  worker.postMessage(init);
  worker.postMessage({ kind: 'enable', data: { enabled: true, participantIdentity: 'alice' } });
  const transform = new win.RTCRtpScriptTransform(worker, { kind: 'decode', participantIdentity: 'eve', trackId: 'TR_9' });
  assert.ok(transform instanceof FakeTransform);
  // built in the module's realm: compare as JSON
  assert.equal(
    JSON.stringify(posted.at(-1)),
    JSON.stringify({ kind: 'enable', data: { enabled: true, participantIdentity: 'eve' } })
  );
  assert.equal(created[0].postedBefore, 3);
  // Chromium path: the enable goes out before the decode message itself
  worker.postMessage({ kind: 'decode', data: { participantIdentity: 'frank', trackId: 'TR_10' } });
  assert.equal(posted.at(-2).kind, 'enable');
  assert.equal(posted.at(-2).data.participantIdentity, 'frank');
  assert.equal(posted.at(-1).kind, 'decode');
  assert.ok(diagLines.some((l) => /no encryption flag/.test(l)));
});
