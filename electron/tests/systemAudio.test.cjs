const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSystemAudio, BLOCK_BYTES } = require('../lib/systemAudio.cjs');
function setup(options = {}) {
  const children = [], sent = [];
  const capture = createSystemAudio({ helper: '/fixed/helper', send: (data) => sent.push(data), ...options, spawnProcess: (file, args) => {
    assert.equal(file, '/fixed/helper');
    assert.deepEqual(args, [String(process.pid)]);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.killed = [];
    child.kill = (signal) => { child.killed.push(signal); queueMicrotask(() => child.emit('exit', 0)); };
    children.push(child); return child;
  } });
  const start = async () => {
    const pending = capture.start(), child = children.at(-1);
    child.stderr.emit('data', Buffer.from('REA'));
    child.stderr.emit('data', Buffer.from('DY\n'));
    return { id: await pending, child };
  };
  return { capture, children, sent, start };
}
test('PCM is reframed across arbitrary pipe boundaries, bounded and acknowledged', async () => {
  const env = setup(); const { id, child } = await env.start();
  child.stdout.emit('data', Buffer.alloc(7, 1));
  assert.equal(env.sent.length, 0);
  child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES - 7, 2));
  assert.equal(env.sent[0].pcm.length, BLOCK_BYTES);
  assert.equal(env.sent[0].pcm[6], 1); assert.equal(env.sent[0].pcm[7], 2);
  child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES * 100));
  assert.equal(env.sent.length, 8);
  env.capture.ack('wrong-session');
  child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES)); assert.equal(env.sent.length, 8);
  env.capture.ack(id);
  child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES)); assert.equal(env.sent.length, 9);
  env.capture.close();
});
test('old stops, exits and PCM cannot interfere with a newer share', async () => {
  const env = setup(); const first = await env.start(); const second = await env.start();
  env.capture.stop(first.id);
  first.child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES));
  first.child.emit('exit', 0);
  assert.equal(second.child.killed.length, 0);
  second.child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES));
  assert.equal(env.sent.at(-1).id, second.id);
  env.capture.close();
});
test('missing helper and audio-server errors reject start and release the child', async () => {
  for (const error of ['spawn', 'server']) {
    const env = setup(); const pending = env.capture.start();
    const rejected = assert.rejects(pending);
    const child = env.children[0];
    if (error === 'spawn') child.emit('error', new Error('ENOENT'));
    else child.stderr.emit('data', Buffer.from('ERROR Audio server unavailable\n'));
    await rejected;
    assert.equal(child.killed[0], 'SIGTERM'); assert.ok(env.sent[0].error);
  }
});
test('closing during setup rejects the handshake; a hung helper is timed out', async () => {
  const env = setup({ timeoutMs: 10 });
  await assert.rejects(env.capture.start(), /ready/);
  assert.ok(env.sent[0].error.includes('ready'));
  const second = env.capture.start(); const rejected = assert.rejects(second, /canceled/);
  env.capture.close(); await rejected;
});
test('INFO and WARN helper lines are logged but keep the capture and its audio running', async () => {
  const lines = [];
  const env = setup({ log: (line) => lines.push(line) }); const { id, child } = await env.start();
  child.stderr.emit('data', Buffer.from('WARN Application audio monitor failed: Entity killed; sink input 7 (app "Firefox", binary "firefox", sink "easyeffects_sink"), not capturing this stream\nINFO Monitoring sink input 8\n'));
  child.stderr.emit('data', Buffer.from('WARN split '));
  child.stderr.emit('data', Buffer.from('line\n'));
  assert.equal(env.sent.length, 0); assert.equal(child.killed.length, 0);
  child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES));
  assert.equal(env.sent.length, 1); assert.equal(env.sent[0].id, id); assert.ok(env.sent[0].pcm);
  assert.ok(lines.some((line) => line.includes('Entity killed') && line.includes('easyeffects_sink') && line.includes('WARN')));
  assert.ok(lines.some((line) => line.includes('INFO Monitoring sink input 8')));
  assert.ok(lines.some((line) => line.endsWith('WARN split line')));
  assert.ok(lines.some((line) => line.endsWith('READY')));
  env.capture.close();
});
test('a burst of many complete helper lines is not mistaken for an invalid response', async () => {
  const env = setup(); const { child } = await env.start();
  child.stderr.emit('data', Buffer.from('WARN something happened to one stream\n'.repeat(300)));
  assert.equal(child.killed.length, 0); assert.equal(env.sent.length, 0);
  child.stderr.emit('data', Buffer.from('x'.repeat(5000)));
  assert.equal(child.killed[0], 'SIGTERM'); assert.match(env.sent[0].error, /Invalid/);
});
test('an ERROR helper line is logged and still ends the capture with its reason', async () => {
  const lines = [];
  const env = setup({ log: (line) => lines.push(line) }); const { id, child } = await env.start();
  child.stderr.emit('data', Buffer.from('ERROR Audio server disconnected or unavailable: Connection terminated\n'));
  assert.deepEqual(env.sent.at(-1), { id, error: 'Audio server disconnected or unavailable: Connection terminated' });
  assert.equal(child.killed[0], 'SIGTERM');
  assert.ok(lines.some((line) => line.includes('Connection terminated')));
  child.stdout.emit('data', Buffer.alloc(BLOCK_BYTES));
  assert.equal(env.sent.filter((m) => m.pcm).length, 0);
});
test('an unexpected helper exit is logged and reported', async () => {
  const lines = [];
  const env = setup({ log: (line) => lines.push(line) }); const { id, child } = await env.start();
  child.emit('exit', 1, null);
  assert.deepEqual(env.sent.at(-1), { id, error: 'Linux audio capture stopped' });
  assert.ok(lines.some((line) => line.includes('exited code=1')));
});
