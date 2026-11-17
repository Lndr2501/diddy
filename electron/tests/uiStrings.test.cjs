// The shell's own menus and the screen picker follow the UI language the page sends (set_ui_language).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { setUiLanguage, uiText, uiLanguage, DEFAULTS } = require('../lib/uiStrings.cjs');
const { buildContextMenuTemplate } = require('../lib/shellInput.cjs');
const { pickerQuery } = require('../lib/screenPicker.cjs');

const enPath = path.join(__dirname, '..', '..', 'cinny', 'locales', 'en.json');
// The Nix build only copies electron/, the language files are not there.
const skip = !fs.existsSync(enPath) && 'cinny/locales/en.json not in this source tree';

test('the English defaults are the `native` texts of en.json', { skip }, () => {
  const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  assert.deepEqual(Object.keys(DEFAULTS).sort(), Object.keys(en.native).sort());
  Object.keys(DEFAULTS).forEach((name) => assert.equal(DEFAULTS[name], en.native[name], name));
});

test('the right-click menu and the picker use the texts of the page', () => {
  setUiLanguage({ code: 'de', strings: { copyLink: 'Link kopieren', cut: 'Ausschneiden', pickerCancel: 'Abbrechen' } });
  try {
    const template = buildContextMenuTemplate(
      { isEditable: true, linkURL: 'https://example.org', editFlags: { canCut: true } },
      { replaceMisspelling() {}, addToDictionary() {}, copyLink() {} }
    );
    const labels = template.map((item) => item.label).filter(Boolean);
    assert.ok(labels.includes('Link kopieren'));
    assert.ok(labels.includes('Ausschneiden'));
    assert.ok(labels.includes('Undo'), 'texts the page did not send stay English');
    assert.equal(pickerQuery().cancel, 'Abbrechen');
    assert.equal(pickerQuery().lang, 'de');
  } finally {
    setUiLanguage({});
  }
});

test('odd input is ignored', () => {
  setUiLanguage({ code: '../x', strings: { copy: 42, paste: '', cut: 'x'.repeat(500), unknown: 'y' } });
  assert.equal(uiLanguage(), 'en');
  assert.equal(uiText('copy'), 'Copy');
  assert.equal(uiText('paste'), 'Paste');
  assert.equal(uiText('cut'), 'Cut');
  assert.equal(uiText('unknown'), 'unknown');
  setUiLanguage();
  assert.equal(uiText('copyLink'), 'Copy link');
});
