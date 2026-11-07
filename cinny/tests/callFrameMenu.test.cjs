// A right-click over the hidden call view (call in another room) belongs to the chat behind it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/callFrameMenu.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

function load() {
  const mod = {};
  vm.runInNewContext(
    compiled,
    {
      exports: mod,
      require: (id) => {
        if (id !== './contextMenu') throw new Error(id);
        return { describeElement: () => 'el' };
      },
    },
    { filename }
  );
  return mod;
}

const element = ({ inCall = false, name } = {}) => {
  const received = [];
  return {
    name,
    received,
    closest: (sel) => (inCall && sel === '[data-call-embed-container]' ? {} : null),
    dispatchEvent: (evt) => {
      received.push(evt);
      return true;
    },
  };
};

test('the call view counts as hidden when invisible or not clickable', () => {
  const mod = load();
  assert.equal(mod.isCallFrameHidden({ visibility: 'hidden', pointerEvents: 'none' }), true);
  assert.equal(mod.isCallFrameHidden({ visibility: 'hidden', pointerEvents: 'auto' }), true);
  assert.equal(mod.isCallFrameHidden({ visibility: 'visible', pointerEvents: 'none' }), true);
  // the call room: the view is shown and keeps its own Copy menu
  assert.equal(mod.isCallFrameHidden({ visibility: 'visible', pointerEvents: 'auto' }), false);
  assert.equal(mod.isCallFrameHidden(undefined), false);
});

test('frame coordinates are moved into the main window and the event is a plain right-click', () => {
  const mod = load();
  const init = mod.forwardedContextMenuInit(
    { left: 346, top: 158 },
    { clientX: 100, clientY: 40, screenX: 900, screenY: 500, metaKey: true, altKey: true }
  );
  assert.equal(init.clientX, 446);
  assert.equal(init.clientY, 198);
  assert.equal(init.screenX, 900);
  assert.equal(init.button, 2);
  assert.equal(init.bubbles, true);
  assert.equal(init.cancelable, true);
  assert.equal(init.metaKey, true);
  assert.equal(init.altKey, false);
});

test('the right-click goes to the topmost element outside the call view', () => {
  const mod = load();
  const frame = element({ inCall: true, name: 'iframe' });
  const message = element({ name: 'message' });
  const below = element({ name: 'below' });
  let asked;
  const doc = {
    elementsFromPoint: (x, y) => {
      asked = [x, y];
      return [frame, message, below];
    },
  };
  const init = mod.forwardedContextMenuInit({ left: 10, top: 20 }, { clientX: 5, clientY: 6 });
  const result = mod.forwardContextMenu(doc, init, (i) => ({ init: i, defaultPrevented: true }));
  assert.deepEqual(asked, [15, 26]);
  assert.equal(result.target, message);
  assert.equal(result.handled, true);
  assert.equal(message.received.length, 1);
  assert.equal(message.received[0].init.clientX, 15);
  assert.equal(frame.received.length, 0);
  assert.equal(below.received.length, 0);
});

test('without elementsFromPoint the single hit is used, and nothing there means no event', () => {
  const mod = load();
  const message = element();
  const one = mod.forwardContextMenu(
    { elementFromPoint: () => message },
    { clientX: 1, clientY: 1 },
    () => ({ defaultPrevented: false })
  );
  assert.equal(one.target, message);
  assert.equal(one.handled, false);
  let made = 0;
  const none = mod.forwardContextMenu(
    { elementFromPoint: () => null },
    { clientX: 1, clientY: 1 },
    () => {
      made += 1;
      return { defaultPrevented: false };
    }
  );
  assert.equal(none.target, null);
  assert.equal(made, 0);
  // only the call view under the pointer: not sent back into it
  const onlyFrame = mod.forwardContextMenu(
    { elementsFromPoint: () => [element({ inCall: true })] },
    { clientX: 1, clientY: 1 },
    () => ({ defaultPrevented: false })
  );
  assert.equal(onlyFrame.target, null);
});

// Right-click on a person's tile in the call: the Discord-style person menu.
const tile = (label) => ({
  querySelector: (selector) => {
    assert.equal(selector, '[aria-label]');
    return label === undefined ? null : { getAttribute: () => label };
  },
});

test('the tile owner is read from the avatar label, only if it is a Matrix ID', () => {
  const mod = load();
  assert.equal(mod.tileUserId(tile('@lndr:matrix.tllx.eu')), '@lndr:matrix.tllx.eu');
  assert.equal(mod.tileUserId(tile('Unencrypted')), undefined);
  assert.equal(mod.tileUserId(tile(undefined)), undefined);
  assert.equal(mod.tileUserId(null), undefined);
});

test('finds the tile of a given user in the call document', () => {
  const mod = load();
  const a = tile('@a:x.org');
  const b = tile('@b:x.org');
  const doc = {
    querySelectorAll: (selector) => {
      assert.equal(selector, mod.CALL_TILE_SELECTOR);
      return [a, b];
    },
  };
  assert.equal(mod.findCallTile(doc, '@b:x.org'), b);
  assert.equal(mod.findCallTile(doc, '@c:x.org'), undefined);
  assert.equal(mod.findCallTile(null, '@a:x.org'), undefined);
});
