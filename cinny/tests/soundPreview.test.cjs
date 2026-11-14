// MyInstants import preview (#205): one preview at a time, a second click stops it, closing stops it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/call/soundPreview.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod, console }, { filename });

const fakeContext = () => {
  const sources = [];
  const ctx = {
    destination: {},
    decodeAudioData: async (data) => ({ length: data.byteLength }),
    createBufferSource: () => {
      const node = {
        buffer: null,
        onended: null,
        started: false,
        stopped: false,
        connect: () => {},
        disconnect: () => {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(node);
      return node;
    },
    createGain: () => ({ gain: { value: 1 }, connect: () => {}, disconnect: () => {} }),
  };
  return { ctx, sources };
};
const bytes = async () => new ArrayBuffer(8);
const state = (p) => ({ ...p.getSnapshot() });

test('clicking the playing preview again stops it', async () => {
  const { ctx, sources } = fakeContext();
  const p = new mod.SoundPreview(() => ctx);
  await p.toggle('a', bytes, 0.5);
  assert.deepEqual(state(p), { key: 'a', loading: false });
  assert.equal(sources[0].started, true);
  await p.toggle('a', bytes, 0.5);
  assert.equal(sources[0].stopped, true);
  assert.deepEqual(state(p), { key: undefined, loading: false });
});

test('a new preview stops the one before', async () => {
  const { ctx, sources } = fakeContext();
  const p = new mod.SoundPreview(() => ctx);
  await p.toggle('a', bytes, 1);
  await p.toggle('b', bytes, 1);
  assert.equal(sources[0].stopped, true);
  assert.equal(sources[1].started, true);
  assert.equal(p.getSnapshot().key, 'b');
});

test('closing the dialog while the sound still downloads means it never starts', async () => {
  const { ctx, sources } = fakeContext();
  const p = new mod.SoundPreview(() => ctx);
  let release;
  const pending = p.toggle('a', () => new Promise((r) => (release = r)), 1);
  assert.deepEqual(state(p), { key: 'a', loading: true });
  p.stop();
  release(new ArrayBuffer(4));
  await pending;
  assert.equal(sources.length, 0);
  assert.equal(p.getSnapshot().key, undefined);
});

test('a slow first preview does not cut into the second one', async () => {
  const { ctx, sources } = fakeContext();
  const p = new mod.SoundPreview(() => ctx);
  let release;
  const first = p.toggle('a', () => new Promise((r) => (release = r)), 1);
  await p.toggle('b', bytes, 1);
  release(new ArrayBuffer(4));
  await first;
  assert.equal(sources.length, 1);
  assert.equal(p.getSnapshot().key, 'b');
});

test('the end of the sound clears the state, a failed download reports and resets', async () => {
  const { ctx, sources } = fakeContext();
  const p = new mod.SoundPreview(() => ctx);
  let notified = 0;
  p.subscribe(() => (notified += 1));
  await p.toggle('a', bytes, 1);
  sources[0].onended();
  assert.equal(p.getSnapshot().key, undefined);
  assert.ok(notified >= 3);
  await assert.rejects(
    p.toggle(
      'b',
      async () => {
        throw new Error('offline');
      },
      1
    ),
    /offline/
  );
  assert.deepEqual(state(p), { key: undefined, loading: false });
});
