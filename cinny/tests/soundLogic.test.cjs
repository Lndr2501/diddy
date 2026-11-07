// Issue #68: which sound a message makes, when a decline ends the ringback, when a call's
// connection counts as lost, and that call sounds never double up.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;

function loadLogic() {
  const exports = {};
  vm.runInNewContext(compile('../src/app/plugins/soundLogic.ts'), {
    exports,
    setTimeout,
    clearTimeout,
  });
  return exports;
}

function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => {
      const id = next;
      next += 1;
      pending.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => pending.delete(id),
    advance(ms) {
      now += ms;
      [...pending].forEach(([id, { fn, at }]) => {
        if (at <= now && pending.delete(id)) fn();
      });
    },
  };
}

function loadCallSounds() {
  const played = [];
  const loops = [];
  const exports = {};
  vm.runInNewContext(compile('../src/app/plugins/call/callSounds.ts'), {
    exports,
    require: (id) => {
      if (id !== '../sounds') throw new Error(id);
      return {
        playSound: (sound) => played.push(sound),
        startSoundLoop: (sound) => {
          const loop = { sound, stopped: 0 };
          loops.push(loop);
          return () => {
            loop.stopped += 1;
          };
        },
      };
    },
  });
  return { ...exports, played, loops };
}

test('a message that mentions you plays the mention sound, others the message sound', () => {
  const { pickMessageSound } = loadLogic();
  assert.equal(pickMessageSound(true, 0, 0), 'mention');
  assert.equal(pickMessageSound(undefined, 0, 1), 'mention');
  assert.equal(pickMessageSound(false, 2, 3), 'mention');
  assert.equal(pickMessageSound(false, 1, 1), 'message');
  assert.equal(pickMessageSound(undefined, 0, 0), 'message');
  // without an earlier count, an old highlight is no proof that this message mentions you
  assert.equal(pickMessageSound(undefined, undefined, 4), 'message');
});

test('only someone else declining your own ring ends the ringback', () => {
  const { isDeclineOfOwnRing } = loadLogic();
  const me = '@me:x';
  assert.equal(isDeclineOfOwnRing({ sender: '@bob:x', relatesTo: '$ring', relatesToSender: me }, me), true);
  // the ring is not in the local timeline (yet): still a decline of the call you are ringing
  assert.equal(isDeclineOfOwnRing({ sender: '@bob:x', relatesTo: '$ring' }, me), true);
  // your own decline from another device, a decline of someone else's ring, no reference
  assert.equal(isDeclineOfOwnRing({ sender: me, relatesTo: '$ring', relatesToSender: me }, me), false);
  assert.equal(
    isDeclineOfOwnRing({ sender: '@bob:x', relatesTo: '$ring', relatesToSender: '@carol:x' }, me),
    false
  );
  assert.equal(isDeclineOfOwnRing({ sender: '@bob:x' }, me), false);
  assert.equal(isDeclineOfOwnRing({ relatesTo: '$ring' }, me), false);
});

test('a short blip is not a lost connection', () => {
  const { ConnectionLossDetector } = loadLogic();
  const timers = fakeTimers();
  let lost = 0;
  const detector = new ConnectionLossDetector(
    () => {
      lost += 1;
    },
    3000,
    timers
  );
  detector.set('media', false);
  timers.advance(2000);
  detector.set('media', true);
  timers.advance(5000);
  assert.equal(lost, 0);
});

test('a lasting outage is announced once until everything is back', () => {
  const { ConnectionLossDetector } = loadLogic();
  const timers = fakeTimers();
  let lost = 0;
  const detector = new ConnectionLossDetector(
    () => {
      lost += 1;
    },
    3000,
    timers
  );
  detector.set('network', false);
  detector.set('sync', false);
  timers.advance(3000);
  assert.equal(lost, 1);
  // more signals going down, or one of two coming back, is still the same outage
  detector.set('media', false);
  detector.set('network', true);
  timers.advance(10000);
  assert.equal(lost, 1);
  // all back, then a new outage: announced again
  detector.set('sync', true);
  detector.set('media', true);
  detector.set('media', false);
  timers.advance(3000);
  assert.equal(lost, 2);
});

test('after you leave the call nothing is announced', () => {
  const { ConnectionLossDetector } = loadLogic();
  const timers = fakeTimers();
  let lost = 0;
  const detector = new ConnectionLossDetector(
    () => {
      lost += 1;
    },
    3000,
    timers
  );
  detector.set('media', false);
  detector.stop();
  timers.advance(5000);
  detector.set('sync', false);
  timers.advance(5000);
  assert.equal(lost, 0);
});

test('the ringback loops once at a time and stops when the call ends or is declined', () => {
  const sounds = loadCallSounds();
  sounds.startRingback();
  sounds.startRingback();
  assert.equal(sounds.loops.length, 2);
  assert.equal(sounds.loops[0].stopped, 1, 'starting again stops the running loop first');
  sounds.playCallSound('callDeclined', 1000);
  assert.equal(sounds.loops[1].stopped, 1);
  sounds.stopRingback();
  assert.equal(sounds.loops[1].stopped, 1, 'a stopped loop is not stopped twice');

  sounds.startRingback();
  sounds.playCallSound('disconnect', 100000);
  assert.equal(sounds.loops[2].stopped, 1);
});

test('a decline or lost connection is not followed by the leave sound', () => {
  const sounds = loadCallSounds();
  sounds.playCallSound('callDeclined', 1000);
  sounds.playCallSound('disconnect', 2000);
  sounds.playCallSound('connectionLost', 2500);
  assert.deepEqual(sounds.played, ['callDeclined']);
  // later the leave sound is back
  sounds.playCallSound('disconnect', 1000 + sounds.FOLLOW_UP_QUIET_MS);
  assert.deepEqual(sounds.played, ['callDeclined', 'disconnect']);

  const other = loadCallSounds();
  other.playCallSound('connectionLost', 0);
  other.playCallSound('disconnect', 100);
  other.playCallSound('userLeave', 200);
  other.playCallSound('mute', 300);
  assert.deepEqual(other.played, ['connectionLost', 'mute']);
});
