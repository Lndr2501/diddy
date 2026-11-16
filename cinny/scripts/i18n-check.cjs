// npm run i18n:check: checks the language files in locales/ (docs/translating.md).
//   - every file is valid JSON with a complete `_meta`, and `_meta.code` matches the file name
//   - no keys that en.json does not have, placeholders match the English text
//   - every key the code uses (t('…'), translate('…')) exists in en.json
//   - prints how complete every language is
// The rules themselves live in src/app/utils/localeFiles.ts, the same code the app uses when a
// language file is loaded in the settings. Exit code 1 when something is wrong.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cinnyDir = path.join(__dirname, '..');

const loadRules = () => {
  // typescript is a dev dependency; it turns the rules file into plain JS
  // eslint-disable-next-line global-require
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(cinnyDir, 'src/app/utils/localeFiles.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const rules = {};
  vm.runInNewContext(compiled, { exports: rules });
  return rules;
};

const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

// t('area.key'), translate('area.key'), i18n.t('area.key'); keys always have a dot
const KEY_CALL = /(?:(?<![\w$.])t|\btranslate|\bi18n\.t)\(\s*['"]([A-Za-z][\w-]*(?:\.[\w-]+)+)['"]/g;

/** Keys used in the code, with the first file that uses each. */
const usedKeys = (dir = path.join(cinnyDir, 'src')) => {
  const keys = new Map();
  sourceFiles(dir).forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');
    Array.from(text.matchAll(KEY_CALL)).forEach((match) => {
      if (!keys.has(match[1])) keys.set(match[1], path.relative(cinnyDir, file));
    });
  });
  return keys;
};

/**
 * Runs every check. Returns { errors: string[], languages: [{ code, name, percent }],
 * unused: string[] } and does not print anything.
 */
const runCheck = ({ localesDir = path.join(cinnyDir, 'locales'), srcDir } = {}) => {
  const rules = loadRules();
  const errors = [];
  const languages = [];
  const read = (file) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    } catch (e) {
      errors.push(`${file}: not valid JSON (${e.message})`);
      return undefined;
    }
  };

  const en = read('en.json');
  if (!en) return { errors, languages, unused: [] };
  const source = rules.flattenLocale(en);
  rules.validateLocale(en, source, true).forEach((p) => errors.push(`en.json: ${p.key}: ${p.message}`));
  if (en._meta?.code !== 'en') errors.push('en.json: _meta.code must be "en"');
  rules.RESERVED_AREAS.forEach((area) => {
    if (area in en) errors.push(`en.json: "${area}" is reserved for the iOS app`);
  });
  // a placeholder that is not a plain name is most likely a typo ({{ name }, {name}})
  Object.keys(source).forEach((key) => {
    if (/\{\{(?![A-Za-z0-9_]+\}\})|(?<!\{)\{[A-Za-z]+\}(?!\})/.test(source[key])) {
      errors.push(`en.json: ${key}: broken placeholder in "${source[key]}"`);
    }
  });
  languages.push({ code: 'en', name: en._meta?.name ?? 'English', percent: 100 });

  fs.readdirSync(localesDir)
    .filter((file) => file.endsWith('.json') && file !== 'en.json')
    .sort()
    .forEach((file) => {
      const data = read(file);
      if (!data) return;
      rules.validateLocale(data, source).forEach((p) => errors.push(`${file}: ${p.key}: ${p.message}`));
      const code = file.replace(/\.json$/, '');
      if (data._meta && data._meta.code !== code) {
        errors.push(`${file}: _meta.code is "${data._meta.code}", the file name says "${code}"`);
      }
      languages.push({
        code,
        name: data._meta?.name ?? code,
        percent: rules.completionPercent(rules.flattenLocale(data), source),
      });
    });

  const used = usedKeys(srcDir);
  used.forEach((file, key) => {
    if (!rules.knownInSource(key, source)) errors.push(`${file}: uses "${key}", which is not in en.json`);
  });
  const usedBases = new Set(Array.from(used.keys()));
  const unused = Object.keys(source).filter(
    (key) =>
      !usedBases.has(key) &&
      !usedBases.has(rules.pluralBase(key)) &&
      // read with a key built at runtime
      !key.startsWith('settings.search.') &&
      !key.startsWith('native.')
  );
  return { errors, languages, unused };
};

module.exports = { runCheck, usedKeys, KEY_CALL };

if (require.main === module) {
  const { errors, languages, unused } = runCheck();
  languages.forEach((lang) => {
    console.log(`${lang.code.padEnd(8)} ${String(lang.percent).padStart(3)} %  ${lang.name}`);
  });
  if (unused.length) console.log(`\n${unused.length} texts in en.json are not used in the code.`);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s):`);
    errors.forEach((line) => console.error(`  ${line}`));
    process.exit(1);
  }
  console.log('\nAll language files are fine.');
}
