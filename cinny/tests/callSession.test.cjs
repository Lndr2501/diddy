// useCallSession / useCallMembers: a room list row that is reused for another room must not keep
// the call of the old room (call shown at the wrong room, with the other call's people).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/hooks/useCall.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 },
}).outputText;

const noop = () => undefined;

/** Tiny hook runtime: state slots survive between renders of the same "component". */
function makeReact() {
  let slots = [];
  let i = 0;
  const react = {
    useState(init) {
      const idx = i;
      i += 1;
      if (!(idx in slots)) slots[idx] = typeof init === 'function' ? init() : init;
      const set = (v) => {
        slots[idx] = typeof v === 'function' ? v(slots[idx]) : v;
      };
      return [slots[idx], set];
    },
    useEffect: noop,
    useCallback(fn) {
      i += 1;
      return fn;
    },
  };
  return {
    react,
    render(fn) {
      // re-run until no render-time state update happens (like React does)
      for (let n = 0; n < 5; n += 1) {
        const before = slots.slice();
        i = 0;
        const out = fn();
        if (slots.every((s, k) => s === before[k])) return out;
      }
      throw new Error('render loop');
    },
    reset() {
      slots = [];
    },
  };
}

function load() {
  const runtime = makeReact();
  const sessions = {
    A: {
      memberships: [{ userId: '@anton:x' }, { userId: '@luis:x' }],
      on: noop,
      removeListener: noop,
    },
    B: { memberships: [], on: noop, removeListener: noop },
  };
  const mx = {
    matrixRTC: { getRoomSession: (room) => sessions[room.roomId], on: noop, off: noop },
  };
  const mod = { exports: {} };
  const req = (name) => {
    if (name === 'react') return runtime.react;
    if (name === './useMatrixClient') return { useMatrixClient: () => mx };
    return {};
  };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: req });
  return { ...mod.exports, runtime, sessions };
}

test('a reused row follows the new room, not the old call', () => {
  const { useCallSession, useCallMembers, runtime, sessions } = load();
  const useRow = (room) => {
    const session = useCallSession(room);
    return { session, members: useCallMembers(session) };
  };

  const first = runtime.render(() => useRow({ roomId: 'A' }));
  assert.equal(first.session, sessions.A);
  assert.equal(first.members.length, 2);

  // the list reordered: the same row now shows room B (no call)
  const second = runtime.render(() => useRow({ roomId: 'B' }));
  assert.equal(second.session, sessions.B);
  assert.deepEqual(second.members, []);

  // and back again
  const third = runtime.render(() => useRow({ roomId: 'A' }));
  assert.equal(third.session, sessions.A);
  assert.equal(third.members.length, 2);
});
