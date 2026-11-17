/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = path.join(__dirname, '../../electron/lib/systemAudio.cjs');
const available = fs.existsSync(source);
const audio = available ? require('../../electron/lib/systemAudio.cjs') : {};

function setup() {
  const contents = new EventEmitter();
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let killed = false;
  child.kill = () => { killed = true; queueMicrotask(() => child.emit('exit', 0)); };
  const messages = [];
  const capture = audio.createSystemAudio({ helper: 'fixture', send: (message) => messages.push(message), spawnProcess: () => child });
  let removed = false;
  audio.bindSystemAudioLifecycle(contents, capture, () => { removed = true; });
  return { contents, child, capture, killed: () => killed, removed: () => removed };
}

test('a route change during helper startup does not cancel the real capture handshake', { skip: !available }, async () => {
  const env = setup();
  const pending = env.capture.start();
  // Both signatures: current Electron event details and the positional legacy API.
  env.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
  env.contents.emit('did-start-navigation', {}, 'http://localhost/#/login', true, true);
  assert.equal(env.killed(), false);
  env.child.stderr.emit('data', Buffer.from('READY\n'));
  assert.equal(typeof await pending, 'string');
  env.capture.close();
});

test('document navigation still cancels a pending helper and ignores subframes', { skip: !available }, async () => {
  const env = setup();
  const pending = env.capture.start();
  const rejected = assert.rejects(pending, /canceled/);
  env.contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
  assert.equal(env.killed(), false);
  env.contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  await rejected;
  assert.equal(env.killed(), true);
});

test('renderer crash and window destruction still stop captures and release ownership', { skip: !available }, async () => {
  const env = setup();
  const pending = env.capture.start();
  env.child.stderr.emit('data', Buffer.from('READY\n'));
  await pending;
  env.contents.emit('render-process-gone');
  assert.equal(env.killed(), true);
  env.contents.emit('destroyed');
  assert.equal(env.removed(), true);
});
