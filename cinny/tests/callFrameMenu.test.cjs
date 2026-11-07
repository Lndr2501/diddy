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

// Right-click on a tile: only the Diddy person menu, not also Element Call's own one.
function install({ hidden = false } = {}) {
  const mod = load();
  const listeners = [];
  const opened = [];
  const doc = {
    body: {},
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture: !!capture }),
  };
  const iframe = { getBoundingClientRect: () => ({ left: 100, top: 50 }), hidden };
  // the same module instance, with the globals the handlers use
  const sandbox = {
    getComputedStyle: (el) => (el.hidden ? { visibility: 'hidden' } : { visibility: 'visible' }),
    window: { dispatchEvent: (e) => opened.push({ ...e.detail }) },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  };
  const mod2 = {};
  vm.runInNewContext(compiled, {
    exports: mod2,
    require: () => ({ describeElement: () => 'el' }),
    ...sandbox,
  });
  mod2.installCallFrameMenu(doc, iframe);
  return { mod, mod2, listeners, opened };
}

const rightClick = (userId, extra = {}) => {
  const calls = [];
  return {
    calls,
    clientX: 10,
    clientY: 20,
    altKey: false,
    defaultPrevented: false,
    target: { closest: () => (userId ? tile(userId) : null) },
    preventDefault() {
      calls.push('preventDefault');
      this.defaultPrevented = true;
    },
    stopPropagation: () => calls.push('stopPropagation'),
    ...extra,
  };
};

test('a right-click on a tile is taken in the capture phase, before Element Call sees it', () => {
  const { listeners, opened } = install();
  const capture = listeners.find((l) => l.type === 'contextmenu' && l.capture);
  assert.ok(capture);
  const evt = rightClick('@a:x.org');
  capture.fn(evt);
  assert.deepEqual(evt.calls, ['preventDefault', 'stopPropagation']);
  assert.deepEqual(opened, [{ x: 110, y: 70, userId: '@a:x.org' }]);
});

test('the capture handler leaves everything else alone', () => {
  const { listeners, opened } = install();
  const capture = listeners.find((l) => l.type === 'contextmenu' && l.capture);
  const other = rightClick(undefined);
  capture.fn(other);
  const dev = rightClick('@a:x.org', { altKey: true });
  capture.fn(dev);
  assert.deepEqual(other.calls, []);
  assert.deepEqual(dev.calls, []);
  assert.deepEqual(opened, []);
  // another room's hidden call view is handled by the other listener
  const hidden = install({ hidden: true });
  const h = hidden.listeners.find((l) => l.type === 'contextmenu' && l.capture);
  const evt = rightClick('@a:x.org');
  h.fn(evt);
  assert.deepEqual(evt.calls, []);
  assert.deepEqual(hidden.opened, []);
});

test("Element Call's tile menu is opened with a right-click at the given point, and passes the capture handler", () => {
  const { mod2, listeners, opened } = install();
  const capture = listeners.find((l) => l.type === 'contextmenu' && l.capture);
  const seen = [];
  class FakeMouseEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  const el = {
    ownerDocument: { defaultView: { MouseEvent: FakeMouseEvent } },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
    dispatchEvent(evt) {
      // what the capture handler does with the dispatched event
      capture.fn({
        ...evt,
        target: { closest: () => tile('@a:x.org') },
        preventDefault: () => seen.push('pd'),
        stopPropagation: () => seen.push('sp'),
      });
      seen.push(evt);
      return true;
    },
  };
  mod2.openCallTileMenu(el, { x: 33, y: 44 });
  const evt = seen.find((e) => typeof e === 'object');
  assert.equal(evt.type, 'contextmenu');
  assert.equal(evt.clientX, 33);
  assert.equal(evt.clientY, 44);
  assert.equal(evt.button, 2);
  assert.equal(evt.bubbles, true);
  assert.deepEqual(
    seen.filter((e) => typeof e === 'string'),
    []
  );
  assert.deepEqual(opened, []);
  // without a point: the middle of the tile
  mod2.openCallTileMenu(el);
  const last = seen.filter((e) => typeof e === 'object').pop();
  assert.equal(last.clientX, 100);
  assert.equal(last.clientY, 50);
});

test('muted people are read from the mute icon in the call tiles', () => {
  const mod = load();
  const tile = (userId, muted) => ({
    querySelector: (sel) => {
      if (sel === '[aria-label]') return { getAttribute: () => userId };
      if (sel === '[data-muted="true"]') return muted ? {} : null;
      return null;
    },
  });
  const doc = {
    querySelectorAll: () => [
      tile('@a:x.org', true),
      tile('@b:x.org', false),
      tile('not an id', true),
    ],
  };
  assert.deepEqual([...mod.mutedCallUsers(doc)], ['@a:x.org']);
  assert.equal(mod.mutedCallUsers(undefined).size, 0);
});
