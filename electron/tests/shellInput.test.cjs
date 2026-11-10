// Run from electron/: node --test tests/*.test.cjs
// Pure parts of lib/shellInput.cjs (context menu template, shortcut matching); no Electron needed.
const assert = require('node:assert/strict');
const test = require('node:test');

const { buildContextMenuTemplate, shortcutFor } = require('../lib/shellInput.cjs');

const allFlags = { canUndo: true, canRedo: true, canCut: true, canCopy: true, canPaste: true, canSelectAll: true };
const recorder = () => {
  const calls = [];
  return {
    calls,
    replaceMisspelling: (w) => calls.push(['replace', w]),
    addToDictionary: (w) => calls.push(['add', w]),
    copyLink: (u) => calls.push(['link', u]),
  };
};
const describeItem = (item) => item.role ?? item.type ?? item.label;

test('editable field without misspelling: edit commands only, enabled by editFlags', () => {
  const template = buildContextMenuTemplate(
    { isEditable: true, misspelledWord: '', dictionarySuggestions: [], editFlags: { ...allFlags, canCut: false, canCopy: false } },
    recorder()
  );
  assert.deepEqual(template.map(describeItem), ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'selectAll']);
  const enabled = Object.fromEntries(template.filter((i) => i.role).map((i) => [i.role, i.enabled]));
  assert.deepEqual(enabled, { undo: true, redo: true, cut: false, copy: false, paste: true, selectAll: true });
});

test('editable field with a misspelled word: suggestions and Add to dictionary come first', () => {
  const actions = recorder();
  const template = buildContextMenuTemplate(
    {
      isEditable: true,
      misspelledWord: 'helo',
      dictionarySuggestions: ['hello', 'help', 'hero', 'helot', 'heron', 'hell', 'halo'],
      editFlags: allFlags,
    },
    actions
  );
  assert.deepEqual(template.slice(0, 7).map(describeItem), [
    'hello', 'help', 'hero', 'helot', 'heron', 'Add to dictionary', 'separator',
  ]);
  assert.equal(template.length, 7 + 7);
  template[0].click();
  template[5].click();
  assert.deepEqual(actions.calls, [['replace', 'hello'], ['add', 'helo']]);
});

test('misspelled word without suggestions says so and still offers the dictionary', () => {
  const template = buildContextMenuTemplate(
    { isEditable: true, misspelledWord: 'xqzv', dictionarySuggestions: [], editFlags: allFlags },
    recorder()
  );
  assert.deepEqual(template.slice(0, 3).map(describeItem), ['No suggestions', 'Add to dictionary', 'separator']);
  assert.equal(template[0].enabled, false);
});

test('selection outside a field offers Copy only', () => {
  const template = buildContextMenuTemplate({ isEditable: false, selectionText: 'some text', editFlags: allFlags }, recorder());
  assert.deepEqual(template, [{ role: 'copy' }]);
  assert.deepEqual(buildContextMenuTemplate({ isEditable: false, selectionText: '   ' }, recorder()), []);
});

test('http(s) links get Copy link, other schemes do not', () => {
  const actions = recorder();
  const template = buildContextMenuTemplate({ isEditable: false, selectionText: '', linkURL: 'https://example.org/a' }, actions);
  assert.deepEqual(template.map(describeItem), ['Copy link']);
  template[0].click();
  assert.deepEqual(actions.calls, [['link', 'https://example.org/a']]);

  for (const linkURL of ['javascript:alert(1)', 'mailto:a@b.c', 'file:///etc/passwd', '']) {
    assert.deepEqual(buildContextMenuTemplate({ isEditable: false, selectionText: '', linkURL }, recorder()), []);
  }
});

test('selected link text: Copy, separator, Copy link', () => {
  const template = buildContextMenuTemplate(
    { isEditable: false, selectionText: 'x', linkURL: 'http://a.b/' },
    recorder()
  );
  assert.deepEqual(template.map(describeItem), ['copy', 'separator', 'Copy link']);
});

test('nothing to show gives an empty template', () => {
  assert.deepEqual(buildContextMenuTemplate({ isEditable: false, selectionText: '', linkURL: '', editFlags: allFlags }, recorder()), []);
  assert.deepEqual(buildContextMenuTemplate({}, recorder()), []);
});

const key = (overrides) => ({
  type: 'keyDown', key: '', isAutoRepeat: false, isComposing: false,
  control: false, alt: false, shift: false, meta: false, ...overrides,
});

test('Ctrl+Q quits, with or without caps lock', () => {
  assert.equal(shortcutFor(key({ key: 'q', control: true })), 'quit');
  assert.equal(shortcutFor(key({ key: 'Q', control: true })), 'quit');
});

test('Ctrl+Shift+Q, Alt+Ctrl+Q and a bare Q are left to the page', () => {
  assert.equal(shortcutFor(key({ key: 'Q', control: true, shift: true })), undefined);
  assert.equal(shortcutFor(key({ key: 'q', control: true, alt: true })), undefined);
  assert.equal(shortcutFor(key({ key: 'q' })), undefined);
  assert.equal(shortcutFor(key({ key: 'q', meta: true })), undefined);
});

test('F11 toggles full screen, with modifiers it does not', () => {
  assert.equal(shortcutFor(key({ key: 'F11' })), 'fullscreen');
  assert.equal(shortcutFor(key({ key: 'F11', shift: true })), undefined);
  assert.equal(shortcutFor(key({ key: 'F11', control: true })), undefined);
});

test('Alt+Left / Alt+Right go back / forward, other combinations do not', () => {
  assert.equal(shortcutFor(key({ key: 'ArrowLeft', alt: true })), 'back');
  assert.equal(shortcutFor(key({ key: 'ArrowRight', alt: true })), 'forward');
  assert.equal(shortcutFor(key({ key: 'ArrowLeft' })), undefined);
  assert.equal(shortcutFor(key({ key: 'ArrowLeft', alt: true, shift: true })), undefined);
  assert.equal(shortcutFor(key({ key: 'ArrowLeft', alt: true, control: true })), undefined);
});

test('key up, auto-repeat and IME composition never trigger a shortcut', () => {
  assert.equal(shortcutFor(key({ type: 'keyUp', key: 'F11' })), undefined);
  assert.equal(shortcutFor(key({ key: 'F11', isAutoRepeat: true })), undefined);
  assert.equal(shortcutFor(key({ key: 'q', control: true, isAutoRepeat: true })), undefined);
  assert.equal(shortcutFor(key({ key: 'ArrowLeft', alt: true, isComposing: true })), undefined);
  assert.equal(shortcutFor(undefined), undefined);
});
