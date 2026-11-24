// Room lists (Home, Direct): measured row heights follow the room, not its position (#262).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
// react-virtual re-exports the core virtualizer the room lists use
const { Virtualizer } = require('@tanstack/react-virtual');

const src = (rel) => path.join(__dirname, '../src/app', rel);

function loadKeyModule() {
  const output = ts.transpileModule(fs.readFileSync(src('utils/roomNavKey.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports });
  return module.exports;
}

const { roomNavRowKey } = loadKeyModule();

const category = { type: 'category', id: 'rooms' };
const room = (roomId) => ({ type: 'room', roomId });

/** A virtualizer like the room lists use, without a scroll element. */
function makeVirtualizer(rows, keyed) {
  const options = (list) => ({
    count: list.length,
    getScrollElement: () => null,
    estimateSize: () => 38,
    getItemKey: keyed ? (index) => roomNavRowKey(list[index], index) : undefined,
    scrollToFn: () => undefined,
    observeElementRect: () => undefined,
    observeElementOffset: () => undefined,
  });
  const v = new Virtualizer(options(rows));
  return { v, setRows: (list) => v.setOptions(options(list)) };
}

/** The row height for each room, as the list lays them out. */
function heights(v, rows) {
  const out = {};
  v.getMeasurements().forEach((m, i) => {
    out[rows[i].type === 'room' ? rows[i].roomId : `#${rows[i].id}`] = m.size;
  });
  return out;
}

function moveCallRoomUp(keyed) {
  const before = [category, room('mail'), room('luis'), room('lndr')];
  const { v, setRows } = makeVirtualizer(before, keyed);
  v.getMeasurements();
  // the row of "luis" grows: a call with two people listed underneath
  // (virtual-core 3.14 takes the index; before 3.13 it took the measurement)
  v.resizeItem(2, 110);
  // a message moves "luis" above "mail"; the row keeps its DOM node, so it is not measured again
  const after = [category, room('luis'), room('mail'), room('lndr')];
  setRows(after);
  return heights(v, after);
}

test('roomNavRowKey gives rooms and categories their own keys', () => {
  assert.equal(roomNavRowKey(room('!a:x'), 3), 'room:!a:x');
  assert.equal(roomNavRowKey({ type: 'category', id: 'direct' }, 0), 'category:direct');
  assert.notEqual(roomNavRowKey({ type: 'category', id: 'x' }, 0), roomNavRowKey(room('x'), 0));
  assert.equal(roomNavRowKey(undefined, 7), 7);
});

test('a room keeps its measured height when the list reorders (#262)', () => {
  assert.deepEqual(moveCallRoomUp(true), { '#rooms': 38, luis: 110, mail: 38, lndr: 38 });
});

test('keyed by index, the height stays at the old position (the bug)', () => {
  // proves the test above can fail: the call members would cover "mail" and leave a gap
  assert.deepEqual(moveCallRoomUp(false), { '#rooms': 38, luis: 38, mail: 110, lndr: 38 });
});

test('Home and Direct pass the room key to the virtualizer', () => {
  ['pages/client/home/Home.tsx', 'pages/client/direct/Direct.tsx'].forEach((file) => {
    const text = fs.readFileSync(src(file), 'utf8');
    assert.match(text, /roomNavRowKey\(virtualItems\[index\], index\)/, file);
    assert.match(text, /useVirtualizer\(\{[^}]*getItemKey,/s, file);
  });
});
