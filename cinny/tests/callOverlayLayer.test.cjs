// #260: Element Call's tile menu (volume, mute for me) lay under the name tag of the
// neighbouring tile of Diddy's call stage. The call container is fixed without a z-index, so
// every positioned stage element with a z-index painted over it. While Element Call shows a menu
// or dialog, the container now goes above all of them, and stays below the toasts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8');
const callStyles = read('features/call/styles.css.ts');

const layers = Object.fromEntries(
  [...read('components/sidebar/diddyTokens.ts').matchAll(/^\s+(\w+): (\d+),$/gm)].map((m) => [m[1], Number(m[2])])
);

const overlayZ = () => {
  assert.match(
    callStyles,
    /globalStyle\('\[data-call-embed-container\]\[data-call-overlay\]', \{\s*zIndex: LAYER\.popover,/
  );
  return layers.popover;
};

const zIndexes = (source) =>
  [...source.matchAll(/zIndex: (\d+)/g)].map((m) => Number(m[1]));

test('an open Element Call menu lies above every part of the call stage', () => {
  const stage = Math.max(...zIndexes(callStyles));
  assert.ok(overlayZ() > stage, `overlay ${overlayZ()} above stage elements (max ${stage})`);
});

test('and above the profile effects drawn on stage avatars', () => {
  const effects = Math.max(...zIndexes(read('components/diddy/ProfileEffect.css.ts')));
  assert.ok(overlayZ() > effects);
});

test('dialogs, notices and toasts stay above an open call menu', () => {
  for (const layer of ['dialog', 'notice', 'toast']) assert.ok(overlayZ() < layers[layer], layer);
});

test('the call container itself still has no z-index while no menu is open', () => {
  const provider = read('components/CallEmbedProvider.tsx');
  const start = provider.indexOf('data-call-embed-container');
  const block = provider.slice(start, provider.indexOf('}}', start));
  assert.doesNotMatch(block, /zIndex/);
});
