// Guards in profiles.ts that are hard to run without a Matrix client, checked in the source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const dir = path.join(__dirname, '../src/app/plugins/diddy');
const profiles = fs.readFileSync(path.join(dir, 'profiles.ts'), 'utf8');
const versionSync = fs.readFileSync(path.join(dir, 'versionSync.ts'), 'utf8');
const body = (name) => {
  const start = profiles.indexOf(`export const ${name} = async`);
  assert.ok(start >= 0, `${name} not found`);
  return profiles.slice(start, profiles.indexOf('\n};\n', start));
};

test('profile writes wait until the stored profile is loaded (no wipe at start)', () => {
  assert.match(body('setMyProfile'), /if \(!ownProfileKnown\(mx\)\) throw/);
  assert.match(body('patchMyProfile'), /waitForOwnProfile\(mx,/);
  assert.match(versionSync, /if \(!ownProfileKnown\(mx\)\)/);
});

test('only a real join (not a name or avatar change) triggers re-announcing', () => {
  assert.match(profiles, /getPrevContent\(\)[\s\S]{0,80}membership[\s\S]{0,200}before !== 'join'/);
});

test('oversized Diddy data is refused before it is sent', () => {
  assert.match(body('writeDiddyData'), /size > MAX_CONTENT_CHARS/);
});

test('leaving an options room forgets its backfill so a rejoin reads it again', () => {
  const leave = profiles.slice(profiles.indexOf("membership === 'leave'"));
  ['backfilled', 'backfillTries', 'membersRequested', 'scannedRooms'].forEach((set) =>
    assert.match(leave.slice(0, 800), new RegExp(`${set}\\.delete\\(room\\.roomId\\)`))
  );
});
