// The settings search finds settings, not only page names (#182).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const settingsDir = path.join(__dirname, '../src/app/features/settings');
const compiled = ts.transpileModule(fs.readFileSync(path.join(settingsDir, 'settingsSearch.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = {};
vm.runInNewContext(compiled, { exports: mod });
const index = mod.SETTINGS_SEARCH_INDEX;
const pagesFor = (query) =>
  Object.keys(index).filter((key) => mod.entryMatches(index[key], query));

// Texts with a title prop that are not settings (empty states and the like).
const NOT_SETTINGS = new Set(['No plugins yet', 'Close (Esc)', 'Back']);

const tsxFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });

test('every setting title in features/settings is in the search index', () => {
  const known = new Set(Object.values(index).flatMap((entry) => [entry.name, ...entry.titles]));
  const missing = [];
  for (const file of tsxFiles(settingsDir)) {
    for (const [, title] of fs.readFileSync(file, 'utf8').matchAll(/title="([^"]{2,80})"/g)) {
      if (!known.has(title) && !NOT_SETTINGS.has(title)) {
        missing.push(`${path.relative(settingsDir, file)}: ${title}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'add these to settingsSearch.ts');
});

test('settings are found on their page', () => {
  assert.deepEqual(pagesFor('noise suppression'), ['calls']);
  assert.deepEqual(pagesFor('noise sup'), ['calls']);
  assert.deepEqual(pagesFor('zoom'), ['appearance']);
  assert.deepEqual(pagesFor('time format'), ['chat']);
  assert.deepEqual(pagesFor('sponsorblock'), ['calls']);
  assert.ok(pagesFor('welcome guide').includes('about'));
  assert.ok(pagesFor('nameplate').includes('appearance'));
  assert.ok(pagesFor('nameplate').includes('profile'));
  assert.ok(pagesFor('keyword').includes('notifications'));
});

test('the page shows which settings matched', () => {
  assert.deepEqual([...mod.matchingTitles(index.calls, 'noise')], ['Noise suppression']);
  assert.deepEqual([...mod.matchingTitles(index.appearance, 'page zoom')], ['Page Zoom']);
  assert.deepEqual([...mod.matchingTitles(index.chat, '')], []);
  assert.ok(mod.matchingTitles(index.chat, 'url').length <= 3);
});

test('empty, unknown and odd queries', () => {
  assert.equal(pagesFor('').length, Object.keys(index).length);
  assert.equal(pagesFor('   ').length, Object.keys(index).length);
  assert.deepEqual(pagesFor('qqqzzz'), []);
  assert.deepEqual(pagesFor('ZOOM'), ['appearance']);
  assert.ok(pagesFor('Ënter newline').includes('chat'), 'accents are ignored');
  assert.ok(pagesFor('developer').includes('developerTools'));
  assert.ok(pagesFor('@room').includes('notifications'));
});
