// Leaving a call (review): the call page sends its leave event after reporting the hangup, so it
// must not be removed at once, and the microphone that runs in Diddy's window must be released.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../src/app', rel), 'utf8');

test('replacing the call lets the old page leave first', () => {
  assert.match(read('state/callEmbed.ts'), /prevCallEmbed\.disposeAfterLeave\(\)/);
  const embed = read('plugins/call/CallEmbed.ts');
  assert.match(embed, /public disposeAfterLeave\(\)/);
  assert.match(embed, /ElementWidgetActions\.Close/);
  assert.match(embed, /LEAVE_GRACE_MS/);
});

test('the call microphone is released when the call goes', () => {
  const embed = read('plugins/call/CallEmbed.ts');
  const dispose = embed.slice(embed.indexOf('public dispose(): void'));
  assert.match(dispose.slice(0, 1200), /releaseCallMicrophones\(this\.iframe\.contentWindow\)/);
  assert.match(read('plugins/call/soundboard.ts'), /export const releaseCallMicrophones/);
});

test('a media toggle without an echo from Element Call does not stay busy', () => {
  assert.match(read('plugins/call/CallControl.ts'), /MEDIA_STATE_ECHO_MS/);
});

test('error pages are not saved as downloaded files', () => {
  assert.match(read('utils/matrix.ts'), /if \(!res\.ok\) throw/);
});
