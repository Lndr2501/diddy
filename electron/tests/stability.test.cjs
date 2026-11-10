// Run from electron/: node --test tests/*.test.cjs
// Pure helpers behind the crash handling, startup order, feature switches and window guard.
const assert = require('node:assert/strict');
const test = require('node:test');

const { mergeFeatureList, addFeatureSwitch } = require('../lib/commandLine.cjs');
const { createStartupGate } = require('../lib/startupGate.cjs');
const { shouldReloadAfter, createRateLimiter, describeError } = require('../lib/crashGuard.cjs');
const { guardWindowBounds } = require('../lib/windowFit.cjs');

test('mergeFeatureList keeps entries a wrapper already set', () => {
  assert.equal(mergeFeatureList('', 'WebRTCPipeWireCapturer'), 'WebRTCPipeWireCapturer');
  assert.equal(mergeFeatureList(undefined, 'A'), 'A');
  assert.equal(mergeFeatureList('WaylandWindowDecorations', 'WebRTCPipeWireCapturer'), 'WaylandWindowDecorations,WebRTCPipeWireCapturer');
  assert.equal(mergeFeatureList(' X , ,Y ', 'Z'), 'X,Y,Z');
});

test('mergeFeatureList does not duplicate a feature, also with parameters', () => {
  assert.equal(mergeFeatureList('A,WebRTCPipeWireCapturer', 'WebRTCPipeWireCapturer'), 'A,WebRTCPipeWireCapturer');
  assert.equal(mergeFeatureList('Foo:bar/1,Baz', 'Foo'), 'Foo:bar/1,Baz');
  assert.equal(mergeFeatureList('Foo<Trial', 'Foo'), 'Foo<Trial');
});

test('addFeatureSwitch merges with the current command line value', () => {
  const calls = [];
  const commandLine = {
    getSwitchValue: (name) => (name === 'enable-features' ? 'WaylandWindowDecorations' : ''),
    appendSwitch: (name, value) => calls.push([name, value]),
  };
  addFeatureSwitch(commandLine, 'enable-features', 'WebRTCPipeWireCapturer');
  addFeatureSwitch(commandLine, 'disable-features', 'WebRTCPipeWireCapturer');
  assert.deepEqual(calls, [
    ['enable-features', 'WaylandWindowDecorations,WebRTCPipeWireCapturer'],
    ['disable-features', 'WebRTCPipeWireCapturer'],
  ]);
});

test('startup gate holds launches until open, then runs them in order', () => {
  const seen = [];
  const gate = createStartupGate((item) => seen.push(item));
  gate.submit(['a']);
  gate.submit(['b']);
  assert.deepEqual(seen, []);
  assert.equal(gate.size(), 2);
  gate.open();
  assert.deepEqual(seen, [['a'], ['b']]);
  assert.equal(gate.size(), 0);
  gate.submit(['c']);
  assert.deepEqual(seen, [['a'], ['b'], ['c']]);
  assert.equal(gate.isOpen(), true);
});

test('startup gate caps the backlog and survives a failing item', () => {
  const seen = [];
  const errors = [];
  const gate = createStartupGate(
    (item) => {
      if (item === 1) throw new Error('boom');
      seen.push(item);
    },
    { max: 3, onError: (error) => errors.push(error.message) }
  );
  [0, 1, 2, 3, 4].forEach((item) => gate.submit(item));
  gate.open();
  assert.deepEqual(seen, [0, 2]);
  assert.deepEqual(errors, ['boom']);
});

test('only a clean exit does not reload the renderer', () => {
  assert.equal(shouldReloadAfter('clean-exit'), false);
  for (const reason of ['crashed', 'oom', 'launch-failed', 'abnormal-exit', 'killed', 'integrity-failure', 'memory-eviction']) {
    assert.equal(shouldReloadAfter(reason), true, reason);
  }
});

test('rate limiter allows max events per window and recovers afterwards', () => {
  let now = 1000;
  const limiter = createRateLimiter({ max: 3, windowMs: 60000, now: () => now });
  assert.deepEqual([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()], [true, true, true, false]);
  now += 59999;
  assert.equal(limiter.allow(), false);
  now += 2;
  assert.equal(limiter.allow(), true);
});

test('describeError handles errors, strings and odd values', () => {
  assert.match(describeError(new Error('bad')), /bad/);
  assert.equal(describeError('plain'), 'plain');
  assert.equal(describeError({ a: 1 }), '{"a":1}');
  assert.equal(describeError(undefined), 'undefined');
  const circular = {};
  circular.self = circular;
  assert.equal(describeError(circular), '[object Object]');
});

const MAIN = { x: 0, y: 0, width: 1920, height: 1080 };
const SIDE = { x: 1920, y: 0, width: 1920, height: 1080 };

test('window guard leaves a reachable window alone', () => {
  assert.equal(guardWindowBounds({ x: 100, y: 100, width: 1200, height: 800 }, [MAIN]), undefined);
  assert.equal(guardWindowBounds({ x: 2000, y: 100, width: 1200, height: 800 }, [MAIN, SIDE]), undefined);
  // a window straddling two displays is still reachable
  assert.equal(guardWindowBounds({ x: 1500, y: 100, width: 1200, height: 800 }, [MAIN, SIDE]), undefined);
});

test('window guard recentres a window left on a removed display', () => {
  const fixed = guardWindowBounds({ x: 2000, y: 100, width: 1200, height: 800 }, [MAIN]);
  assert.deepEqual(fixed, { x: 360, y: 140, width: 1200, height: 800 });
});

test('window guard treats a window with only a sliver on screen as lost', () => {
  const fixed = guardWindowBounds({ x: 1900, y: 100, width: 1200, height: 800 }, [MAIN]);
  assert.deepEqual(fixed, { x: 360, y: 140, width: 1200, height: 800 });
});

test('window guard shrinks a window bigger than the fallback area', () => {
  const area = { x: 10, y: 20, width: 1000, height: 700 };
  const fixed = guardWindowBounds({ x: 5000, y: 5000, width: 3000, height: 2000 }, [area]);
  assert.deepEqual(fixed, { x: 10, y: 20, width: 1000, height: 700 });
});

test('window guard without a reliable position only limits the size', () => {
  const options = { positionReliable: false };
  assert.equal(guardWindowBounds({ x: 0, y: 0, width: 1200, height: 800 }, [MAIN], options), undefined);
  assert.deepEqual(guardWindowBounds({ x: 0, y: 0, width: 3000, height: 800 }, [MAIN], options), { x: 0, y: 0, width: 1920, height: 800 });
  assert.equal(guardWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, [], options), undefined);
});
