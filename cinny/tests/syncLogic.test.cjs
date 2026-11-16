// Sync between your own devices and between users: shared options room lists, app settings and
// which options rooms hold an older copy of your profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const load = (name) => {
  const filename = path.join(__dirname, `../src/app/plugins/diddy/${name}.ts`);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = {};
  vm.runInNewContext(code, { exports: mod, Number, JSON, Object, Array, Math }, { filename });
  return mod;
};
const plain = (v) => JSON.parse(JSON.stringify(v));

// --- options room lists -------------------------------------------------------------------------
const lists = load('roomListSync');

test('nothing on the account: this device writes its lists', () => {
  const r = lists.reconcileRoomLists({ light: ['!a:x'], left: [] }, undefined, false);
  assert.equal(r.write, true);
  assert.deepEqual(plain(r.next), { light: ['!a:x'], left: [] });
  assert.equal(lists.reconcileRoomLists({ light: [], left: [] }, undefined, false).write, false);
});

test('first contact joins both lists, so the phone learns the desktop room and vice versa', () => {
  const r = lists.reconcileRoomLists(
    { light: ['!phone:x'], left: ['!old:x'] },
    { light: ['!desk:x'], left: [] },
    false
  );
  assert.deepEqual(plain(r.next), { light: ['!desk:x', '!phone:x'], left: ['!old:x'] });
  assert.equal(r.write, true);
});

test('after the first contact the account wins: a room removed elsewhere goes here too', () => {
  const r = lists.reconcileRoomLists({ light: ['!a:x', '!b:x'], left: [] }, { light: ['!a:x'], left: [] }, true);
  assert.deepEqual(plain(r.next), { light: ['!a:x'], left: [] });
  assert.equal(r.write, false);
});

test('stored lists are checked: only room ids, no duplicates, newest 200 kept', () => {
  assert.equal(lists.parseRoomLists(null), undefined);
  assert.equal(lists.parseRoomLists({}), undefined);
  assert.deepEqual(plain(lists.parseRoomLists({ light: ['!a:x', '!a:x', 5, 'nope', {}] })), {
    light: ['!a:x'],
    left: [],
  });
  const many = Array.from({ length: 250 }, (_, i) => `!r${i}:x`);
  const parsed = lists.parseRoomLists({ light: many, left: [] });
  assert.equal(parsed.light.length, 200);
  assert.equal(parsed.light[199], '!r249:x');
});

// --- app settings ---------------------------------------------------------------------------------
const settings = load('settingsSync');

test('a newer change on another device is taken over, an older one is not', () => {
  const remote = settings.parseSharedSettings({
    values: { themeId: 'light-theme', hour24Clock: true },
    at: { themeId: 2000, hour24Clock: 500 },
  });
  const r = settings.mergeSettings(
    { themeId: 'dark-theme', hour24Clock: false },
    { themeId: 1000, hour24Clock: 900 },
    remote
  );
  assert.deepEqual(plain(r.apply), { themeId: 'light-theme' });
  assert.equal(r.at.themeId, 2000);
  // the clock changed here later, so it is written back
  assert.equal(r.write.values.hour24Clock, false);
  assert.equal(r.write.at.hour24Clock, 900);
  assert.equal(r.write.values.themeId, 'light-theme');
});

test('two devices changing different settings keep both', () => {
  const desk = settings.mergeSettings({ messageLayout: 2 }, { messageLayout: 3000 }, undefined);
  const stored = settings.parseSharedSettings(desk.write);
  const phone = settings.mergeSettings({ messageLayout: 0, hour24Clock: true }, { hour24Clock: 3100 }, stored);
  assert.deepEqual(plain(phone.apply), { messageLayout: 2 });
  assert.equal(phone.write.values.hour24Clock, true);
  assert.equal(phone.write.values.messageLayout, 2);
});

test('nothing to do when both sides agree', () => {
  const r = settings.mergeSettings({ themeId: 'x' }, { themeId: 10 }, {
    v: 1,
    values: { themeId: 'x' },
    at: { themeId: 10 },
  });
  assert.deepEqual(plain(r.apply), {});
  assert.equal(r.write, undefined);
});

test('device settings and hostile values are never shared or taken over', () => {
  const parsed = settings.parseSharedSettings({
    values: { pageZoom: 300, showNotifications: false, themeId: { evil: 1 }, hour24Clock: true },
    at: { pageZoom: 9, showNotifications: 9, themeId: 9, hour24Clock: 'x' },
  });
  assert.deepEqual(plain(parsed), { v: 1, values: {}, at: {} });
  const r = settings.mergeSettings({ pageZoom: 150 }, { pageZoom: 50 }, undefined);
  assert.equal(r.write, undefined);
});

test('a device that never shared counts its own changes as old', () => {
  const at = settings.initialStamps(
    { themeId: 'dark-theme', hour24Clock: true, pageZoom: 120 },
    { themeId: 'dark-theme', hour24Clock: false, pageZoom: 100 }
  );
  assert.deepEqual(plain(at), { hour24Clock: 1 });
  const changed = settings.stampChanges({ themeId: 'a' }, { themeId: 'b' }, {}, 5000);
  assert.deepEqual(plain(changed), { themeId: 5000 });
  const same = {};
  assert.equal(settings.stampChanges({ themeId: 'a' }, { themeId: 'a' }, same, 5000), same);
});

// --- profile copies --------------------------------------------------------------------------------
const pick = load('profilePick');
const sanitize = (c) => (c && c.v === 1 ? { font: c.font ?? 'default' } : undefined);

test('rooms with an older, different or missing profile are found, equal copies are not', () => {
  const r = pick.staleProfileRooms(
    [
      { content: { v: 1, font: 'serif' }, ts: 1000 },
      undefined,
      { content: { v: 1, font: 'mono' }, ts: 5000 },
      { content: { v: 1, font: 'mono' }, ts: 4000 },
      { content: { v: 2 }, ts: 9000 },
    ],
    sanitize
  );
  assert.equal(r.newest, 2);
  assert.deepEqual(plain(r.stale), [0, 1, 4]);
});

test('no valid profile anywhere: nothing is copied', () => {
  assert.deepEqual(plain(pick.staleProfileRooms([undefined, { content: { v: 2 }, ts: 1 }], sanitize)), {
    stale: [],
  });
});

// --- your own profile in the account data -------------------------------------------------------
const backup = load('ownProfileBackup');

test('the account data copy is read back as a pick candidate', () => {
  const content = backup.backupContent({ v: 1, font: 'mono' }, 5000);
  assert.deepEqual(plain(backup.parseBackup(content, 6000)), { content: { v: 1, font: 'mono' }, ts: 5000 });
});

test('broken copies or copies from a clock far ahead are ignored', () => {
  const now = 1_000_000_000;
  assert.equal(backup.parseBackup(undefined, now), undefined);
  assert.equal(backup.parseBackup({ ts: 5, profile: [] }, now), undefined);
  assert.equal(backup.parseBackup({ ts: 'x', profile: {} }, now), undefined);
  assert.equal(backup.parseBackup({ ts: now + 60 * 60 * 1000, profile: { v: 1 } }, now), undefined);
  assert.ok(backup.parseBackup({ ts: now + 60 * 1000, profile: { v: 1 } }, now));
});

test('a newer account data copy wins and is copied into the rooms; an older one is updated', () => {
  const rooms = [{ content: { v: 1, font: 'serif' }, ts: 1000 }, undefined];
  const newerBackup = { content: { v: 1, font: 'mono' }, ts: 2000 };
  assert.deepEqual(plain(pick.pickNewestProfile([...rooms, newerBackup], sanitize)), { font: 'mono' });
  const healNewer = pick.staleProfileRooms([...rooms, newerBackup], sanitize);
  assert.equal(healNewer.newest, 2);
  assert.deepEqual(plain(healNewer.stale), [0, 1]);
  const olderBackup = { content: { v: 1, font: 'mono' }, ts: 500 };
  const healOlder = pick.staleProfileRooms([...rooms, olderBackup], sanitize);
  assert.equal(healOlder.newest, 0);
  assert.deepEqual(plain(healOlder.stale), [1, 2]);
});

test('iOS uses the same account data event for your own profile', (t) => {
  const swift = path.join(__dirname, '../../ios/Diddy/Matrix/DiddyOwnProfileBackup.swift');
  if (!fs.existsSync(swift)) {
    t.skip('ios/ is not part of this tree');
    return;
  }
  const src = fs.readFileSync(swift, 'utf8');
  assert.ok(src.includes(`static let eventType = "${backup.OWN_PROFILE_EVENT}"`));
  assert.match(src, /\["v": 1, "ts": ts, "profile": profile\]/);
});
