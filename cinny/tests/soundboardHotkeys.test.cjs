const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/app/plugins/call/soundboardHotkeys.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const hotkeys = {};
vm.runInNewContext(js, { exports: hotkeys });
const {
  parseHotkeyString, hotkeyToString, normalizeHotkeyMap, findHotkeyConflicts,
  pickHotkeyClip, globalBindings, formatHotkey, isEditableTarget, matchesHotkey,
} = hotkeys;

const kinds = (conflicts, id) => Array.from(conflicts[id] || [], (entry) => entry.kind);

test('parses aliases, normalizes stored mappings and rejects invalid or modifier-only keys', () => {
  assert.equal(hotkeyToString(parseHotkeyString('cmd + Shift + a')), 'Shift+Meta+KeyA');
  assert.equal(hotkeyToString(parseHotkeyString('⌥ + 1')), 'Alt+Digit1');
  assert.equal(parseHotkeyString('Ctrl++'), undefined);
  assert.equal(parseHotkeyString('Meta+ShiftLeft'), undefined);
  assert.equal(parseHotkeyString('KeyA+KeyB'), undefined);
  assert.equal(parseHotkeyString('F25'), undefined);
  assert.deepEqual({ ...normalizeHotkeyMap({ first: 'cmd+a', gone: 'Ctrl+1', bad: 'Tab' }, ['first']) }, { first: 'Meta+KeyA' });
  assert.equal(formatHotkey('Ctrl+Alt+Digit1', true), 'Control + Option + 1');
});

test('detects duplicates, agent voice modifier conflicts, typing and non-global keys', () => {
  const map = { a: 'KeyA', b: 'KeyA', c: 'Ctrl+Alt+KeyB', d: 'Shift+F13' };
  const agent = { code: 'AltRight', ctrl: false, alt: false, shift: false, meta: false };
  const found = findHotkeyConflicts(map, { mac: true, global: true, agentHotkey: agent, order: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(kinds(found, 'a'), ['duplicate', 'typing', 'not-global']);
  assert.deepEqual(kinds(found, 'b'), ['duplicate', 'typing', 'not-global']);
  assert.deepEqual(kinds(found, 'c'), ['agent-voice']);
  assert.deepEqual(kinds(found, 'd'), []);
  assert.deepEqual(Array.from(globalBindings(map, ['a', 'b', 'c', 'd'], agent), (v) => v.id), ['d']);
});

test('keydown respects text inputs, AltGr, exact modifiers and repeat', () => {
  const event = { code: 'KeyA', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  assert.equal(pickHotkeyClip({ clip: 'KeyA' }, event, { editable: true, mac: false }), undefined);
  assert.equal(pickHotkeyClip({ clip: 'KeyA' }, event, { editable: false, mac: false }), 'clip');
  assert.equal(pickHotkeyClip({ clip: 'KeyA' }, { ...event, repeat: true }, { editable: false, mac: false }), undefined);
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(matchesHotkey(parseHotkeyString('Ctrl+Alt+A'), { ...event, ctrlKey: true, altKey: true, altGraph: true }), false);
});
