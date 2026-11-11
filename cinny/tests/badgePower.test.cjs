// #168: badge state keys are badge ids, so any member allowed to write that state could replace or
// empty other people's badges. Badge state is admin-only; members send badges as messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const load = (file, deps = {}) => {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/plugins/diddy', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = {};
  vm.runInNewContext(code, {
    exports: mod,
    require: (id) => {
      if (deps[id]) return deps[id];
      throw new Error(`unexpected import ${id}`);
    },
  });
  return mod;
};

const types = load('types.ts', { 'matrix-js-sdk': {} });
const power = load('badgePower.ts', { './types': types });
const DEF = 'app.diddy.badge';
const AWARD = 'app.diddy.badge_award';

test('old options rooms let members write badge state', () => {
  const old = { users_default: 0, events: { 'app.diddy.profile': 0, [DEF]: 0, [AWARD]: 0 } };
  assert.equal(power.badgeStateOpenToMembers(old), true);
});

test('hardening raises only the badge types and keeps everything else', () => {
  const old = {
    users: { '@admin:x': 100 },
    users_default: 0,
    state_default: 50,
    events: { 'app.diddy.profile': 0, [DEF]: 0, [AWARD]: 0, 'm.room.name': 100 },
  };
  const next = power.hardenBadgePowerLevels(old);
  assert.equal(next.events[DEF], 100);
  assert.equal(next.events[AWARD], 100);
  assert.equal(next.events['app.diddy.profile'], 0);
  assert.equal(next.events['m.room.name'], 100);
  assert.deepEqual(next.users, { '@admin:x': 100 });
  assert.equal(power.badgeStateOpenToMembers(next), false);
  assert.equal(power.hardenBadgePowerLevels(next), undefined, 'nothing to do the second time');
  assert.equal(old.events[DEF], 0, 'the input is not changed');
});

test('missing entries fall back to state_default (50), which members do not reach', () => {
  assert.equal(power.badgeStateOpenToMembers({ users_default: 0 }), false);
  assert.equal(power.badgeStateOpenToMembers({ users_default: 0, state_default: 0 }), true);
  assert.equal(power.stateLevelFor({}, DEF), 50);
});

test('new options rooms are created with admin-only badge state', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/app/plugins/diddy/optionsRoom.ts'), 'utf8');
  assert.doesNotMatch(src, /\[BADGE_(DEF|AWARD)_EVENT\]: 0/);
});
