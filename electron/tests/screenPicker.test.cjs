const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createScreenPicker } = require('../lib/screenPicker.cjs');
function setup() {
  const handlers = {}, windows = [];
  const ipcMain = { handle: (key, fn) => { handlers[key] = fn; }, on: (key, fn) => { handlers[key] = fn; } };
  class BrowserWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new EventEmitter(); this.webContents.id = windows.length + 1; this.webContents.setWindowOpenHandler = () => {}; windows.push(this); }
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return false; }
    close() { this.emit('closed'); }
  }
  const pick = createScreenPicker({ BrowserWindow, ipcMain });
  const sources = [{ id: 'screen:1', name: '<script>screen</script>', thumbnail: { toDataURL: () => 'data:image/png;base64,AA==' } }];
  return { pick, sources, windows, handlers, event: (id) => ({ sender: { id } }) };
}
test('only the picker receives sources and can select its offered source', async () => {
  const env = setup(); const result = env.pick(env.sources);
  assert.deepEqual(env.handlers['diddy:screen-sources'](env.event(999)), []);
  env.handlers['diddy:screen-select'](env.event(999), 'screen:1');
  assert.equal(env.windows.length, 1);
  env.handlers['diddy:screen-select'](env.event(1), 'screen:1');
  assert.equal(await result, env.sources[0]);
  assert.deepEqual(env.handlers['diddy:screen-sources'](env.event(1)), []);
});
test('cancel, window close and invented source ids never grant screen capture', async () => {
  for (const action of ['cancel', 'close', 'invalid']) {
    const env = setup(); const result = env.pick(env.sources);
    if (action === 'close') env.windows[0].close();
    else env.handlers['diddy:screen-select'](env.event(1), action === 'cancel' ? null : 'unoffered-source');
    assert.equal(await result, undefined);
  }
});

test('closing the requesting window cancels its picker and removes the lifecycle listener', async () => {
  const env = setup(), owner = new EventEmitter();
  const result = env.pick(env.sources, owner);
  assert.equal(env.windows[0].options.parent, owner);
  owner.emit('closed');
  assert.equal(await result, undefined);
  assert.equal(owner.listenerCount('closed'), 0);
});
