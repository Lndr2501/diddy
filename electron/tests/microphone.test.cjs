// Windows privacy setting for the microphone ("Let desktop apps access your microphone"): the page
// asks it when the call opens the microphone and can open the settings page (lib/microphone.cjs).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createMicrophoneAccess, SETTINGS_URI } = require('../lib/microphone.cjs');

const fake = (answer) => {
  const asked = [];
  const opened = [];
  const lines = [];
  const access = createMicrophoneAccess({
    platform: 'win32',
    systemPreferences: {
      getMediaAccessStatus: (kind) => {
        asked.push(kind);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
    shell: { openExternal: async (uri) => opened.push(uri) },
    log: (line) => lines.push(line),
  });
  return { ...access, asked, opened, lines };
};

test('Windows: the privacy answer is passed on and logged once per change', () => {
  const mic = fake('denied');
  assert.equal(mic.microphoneAccess(), 'denied');
  assert.equal(mic.microphoneAccess(), 'denied');
  assert.deepEqual(mic.asked, ['microphone', 'microphone']);
  assert.deepEqual(mic.lines, ['microphone access (Windows privacy settings): denied']);
});

test('odd answers and errors count as unknown', () => {
  assert.equal(fake('weird').microphoneAccess(), 'unknown');
  const failing = fake(new Error('boom'));
  assert.equal(failing.microphoneAccess(), 'unknown');
  assert.match(failing.lines[0], /query failed: boom/);
});

test('other systems answer unknown without asking', () => {
  const mic = createMicrophoneAccess({
    platform: 'linux',
    systemPreferences: { getMediaAccessStatus: () => assert.fail('asked on Linux') },
    shell: { openExternal: () => assert.fail('opened on Linux') },
  });
  assert.equal(mic.microphoneAccess(), 'unknown');
  return assert.rejects(mic.openMicrophoneSettings(), /Only on Windows/);
});

test('the settings page is the microphone privacy page', async () => {
  const mic = fake('granted');
  await mic.openMicrophoneSettings();
  assert.deepEqual(mic.opened, [SETTINGS_URI]);
  assert.equal(SETTINGS_URI, 'ms-settings:privacy-microphone');
});

test('main.cjs offers both commands and logs the setting at start on Windows', () => {
  const main = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
  assert.match(main, /microphone_access: \(\) => microphoneAccess\(\),/);
  assert.match(main, /open_microphone_settings: \(\) => openMicrophoneSettings\(\),/);
  assert.match(main, /if \(process\.platform === 'win32'\) microphoneAccess\(\);/);
});
