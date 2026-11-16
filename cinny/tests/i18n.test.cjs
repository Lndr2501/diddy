// UI languages (docs/translating.md): the language files in locales/ and the rules in
// src/app/utils/localeFiles.ts, the same ones `npm run i18n:check` and the settings use.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { runCheck, usedKeys } = require('../scripts/i18n-check.cjs');

const compiled = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../src/app/utils/localeFiles.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText;
const rules = {};
vm.runInNewContext(compiled, { exports: rules });

const meta = (code) => ({ code, name: code, englishName: code, authors: [] });
const source = {
  'call.bar.mute': 'Mute',
  'room.greeting': 'Hello {{name}}',
  'room.members_one': '{{count}} member',
  'room.members_other': '{{count}} members',
};

test('the language files pass the check, and every key used in the code is in en.json', () => {
  const { errors, languages } = runCheck();
  assert.deepEqual(errors, []);
  const en = languages.find((lang) => lang.code === 'en');
  assert.equal(en.percent, 100);
});

test('de.json is a complete translation', () => {
  const { languages } = runCheck();
  const de = languages.find((lang) => lang.code === 'de');
  assert.ok(de, 'locales/de.json is missing');
  assert.equal(de.percent, 100);
});

test('every file starts with _meta and both source and German have iOS texts', () => {
  const dir = path.join(__dirname, '../locales');
  fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .forEach((file) => {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.equal(Object.keys(JSON.parse(text))[0], '_meta', `${file} must start with _meta`);
    });
  const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
  const de = JSON.parse(fs.readFileSync(path.join(dir, 'de.json'), 'utf8'));
  assert.ok(en.ios);
  for (const key of Object.keys(rules.flattenLocale(en)).filter((key) => key.startsWith('ios.'))) {
    assert.ok(key in rules.flattenLocale(de), `${key} is not translated in German`);
  }
});

test('flatten and unflatten keep nested keys', () => {
  const tree = { _meta: meta('de'), call: { bar: { mute: 'Stumm' } }, ios: { only: 'iOS' } };
  assert.deepEqual({ ...rules.flattenLocale(tree) }, { 'call.bar.mute': 'Stumm', 'ios.only': 'iOS' });
  assert.deepEqual(
    JSON.parse(JSON.stringify(rules.unflattenLocale({ 'a.b.c': 'x', 'a.d': 'y' }))),
    { a: { b: { c: 'x' }, d: 'y' } }
  );
});

test('a good file has no problems, also with extra plural forms', () => {
  const file = {
    _meta: meta('pl'),
    call: { bar: { mute: 'Wycisz' } },
    room: { greeting: 'Cześć {{name}}', members_one: 'członek', members_few: '{{count}} członków' },
  };
  assert.deepEqual([...rules.validateLocale(file, source)], []);
});

test('problems name the key and the placeholder', () => {
  const file = {
    _meta: { code: 'German', name: '', authors: 'me' },
    call: { bar: { mute: 'Stumm', unmute: 'Laut' } },
    room: { greeting: 'Hallo {{user}}', members_other: 4 },
  };
  const problems = rules.validateLocale(file, source).map((p) => `${p.key}: ${p.message}`);
  assert.ok(problems.some((p) => p.startsWith('_meta.code:')));
  assert.ok(problems.some((p) => p.startsWith('_meta.name:')));
  assert.ok(problems.some((p) => p.startsWith('_meta.englishName:')));
  assert.ok(problems.some((p) => p.startsWith('_meta.authors:')));
  assert.ok(problems.includes('call.bar.unmute: This key does not exist in en.json.'));
  assert.ok(problems.includes('room.greeting: The placeholder {{name}} is missing.'));
  assert.ok(problems.includes('room.greeting: The placeholder {{user}} does not exist in English.'));
  assert.ok(problems.includes('room.members_other: Must be a text or a group of texts.'));
  assert.deepEqual([...rules.validateLocale([], source)].length, 1);
  assert.match(rules.describeProblems(rules.validateLocale(file, source), 2), /… and \d+ more$/);
});

test('completion counts plural forms once and ignores empty texts', () => {
  assert.equal(rules.completionPercent({}, source), 0);
  assert.equal(rules.completionPercent({ 'call.bar.mute': 'Stumm' }, source), 33);
  assert.equal(
    rules.completionPercent(
      { 'call.bar.mute': 'x', 'room.greeting': ' ', 'room.members_one': 'y', 'room.members_few': 'z' },
      source
    ),
    66
  );
  assert.equal(rules.completionPercent(source, source), 100);
});

test('the template lists every English key and keeps translations', () => {
  const template = rules.localeTemplate(meta('de'), { 'call.bar.mute': 'Stumm', 'room.members_few': 'x' }, source);
  const flat = rules.flattenLocale(template);
  assert.equal(Object.keys(template)[0], '_meta');
  assert.equal(flat['call.bar.mute'], 'Stumm');
  assert.equal(flat['room.greeting'], 'Hello {{name}}');
  assert.equal(flat['room.members_few'], 'x');
  assert.deepEqual([...rules.validateLocale(template, source)], []);
});

test('the system language picks the closest file', () => {
  const available = ['de', 'en', 'pt-BR'];
  assert.equal(rules.matchSystemLanguage(['de-AT', 'en'], available), 'de');
  assert.equal(rules.matchSystemLanguage(['pt-BR'], available), 'pt-BR');
  assert.equal(rules.matchSystemLanguage(['pt-PT'], available), 'pt-BR');
  assert.equal(rules.matchSystemLanguage(['fr', 'EN-us'], available), 'en');
  assert.equal(rules.matchSystemLanguage(['fr'], available), undefined);
});

test('the check finds unknown keys in Swift and TS code and broken files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-i18n-'));
  const locales = path.join(dir, 'locales');
  const src = path.join(dir, 'src');
  fs.mkdirSync(locales);
  fs.mkdirSync(src);
  const ios = path.join(dir, 'ios');
  fs.mkdirSync(ios);
  fs.writeFileSync(path.join(ios, 'View.swift'), 'Text(L("ios.missing"))');
  fs.writeFileSync(
    path.join(locales, 'en.json'),
    JSON.stringify({ _meta: meta('en'), call: { mute: 'Mute', hi: 'Hi {{name}}' } })
  );
  fs.writeFileSync(path.join(locales, 'de.json'), JSON.stringify({ _meta: meta('fr'), call: { hi: 'Hallo' } }));
  fs.writeFileSync(path.join(locales, 'xx.json'), '{ not json');
  fs.writeFileSync(
    path.join(src, 'a.tsx'),
    "const a = t('call.mute'); const b = translate('call.gone'); const c = format('not.a.key');"
  );
  try {
    const { errors, languages } = runCheck({ localesDir: locales, srcDir: src, iosDir: ios });
    assert.ok(errors.some((e) => e.startsWith('xx.json: not valid JSON')));
    assert.ok(errors.includes('de.json: call.hi: The placeholder {{name}} is missing.'));
    assert.ok(errors.some((e) => e.startsWith('de.json: _meta.code is "fr"')));
    assert.ok(errors.some((e) => e.endsWith('uses "call.gone", which is not in en.json')));
    assert.ok(errors.some((e) => e.endsWith('uses "ios.missing", which is not in en.json')));
    assert.ok(!errors.some((e) => e.includes('not.a.key')));
    assert.equal(languages.find((lang) => lang.code === 'de').percent, 50);
    assert.deepEqual([...usedKeys(src, null).keys()].sort(), ['call.gone', 'call.mute']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
