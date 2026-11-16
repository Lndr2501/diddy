// Language files (cinny/locales/<code>.json): format rules, checks and completion.
//
// One JSON file per language. `_meta` describes the language, every other top-level key is an area
// (`settings`, `call`, `composer` ...) with nested objects down to the texts. Rules, kept simple so
// other clients (the iOS app) can read the same files:
//   - texts are plain strings; `{{name}}` is a placeholder filled in by the app
//   - plurals: the key gets an i18next suffix (`_zero`, `_one`, `_two`, `_few`, `_many`, `_other`,
//     CLDR plural categories) and the app passes `count`; `{{count}}` may be left out in a form
//   - `en.json` is the source; missing texts fall back to English
//   - the top-level area `ios` belongs to the iOS app and is not checked against `en.json`
// No imports: tests and scripts/i18n-check.cjs load this file on its own.

export type LocaleMeta = {
  code: string;
  name: string;
  englishName: string;
  authors: string[];
};

export type LocaleTree = { [key: string]: string | LocaleTree };

export type LocaleFile = LocaleTree & { _meta: LocaleMeta };

export type LocaleProblem = { key: string; message: string };

export const META_KEY = '_meta';
/** top-level area reserved for the iOS app */
export const RESERVED_AREAS = ['ios'];
export const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
/** biggest language file that may be loaded in the app */
export const MAX_LOCALE_FILE_BYTES = 2 * 1024 * 1024;

const CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `settings.appearance.theme` -> text, without `_meta` and the reserved areas. */
export const flattenLocale = (tree: unknown): Record<string, string> => {
  const flat: Record<string, string> = {};
  const walk = (node: Record<string, unknown>, prefix: string) => {
    Object.keys(node).forEach((name) => {
      if (!prefix && (name === META_KEY || RESERVED_AREAS.includes(name))) return;
      const value = node[name];
      const key = prefix ? `${prefix}.${name}` : name;
      if (typeof value === 'string') flat[key] = value;
      else if (isObject(value)) walk(value, key);
    });
  };
  if (isObject(tree)) walk(tree, '');
  return flat;
};

/** `room.members_one` -> `room.members`; keys without a plural suffix stay as they are. */
export const pluralBase = (key: string): string => {
  const suffix = PLURAL_SUFFIXES.find((s) => key.endsWith(s));
  return suffix ? key.slice(0, -suffix.length) : key;
};

export const isPluralKey = (key: string): boolean => pluralBase(key) !== key;

/** Placeholder names of a text, sorted, without duplicates. */
export const placeholdersOf = (text: string): string[] => {
  const names = new Set<string>();
  Array.from(text.matchAll(PLACEHOLDER)).forEach((match) => names.add(match[1]));
  return Array.from(names).sort();
};

/** Whether `key` (as used in code or in another language) exists in English, plurals included. */
export const knownInSource = (key: string, source: Record<string, string>): boolean => {
  if (key in source) return true;
  const base = pluralBase(key);
  if (base !== key) return `${base}_other` in source;
  return `${key}_other` in source;
};

/** The English text a translated key is compared with (for plural forms: the `_other` form). */
const sourceTextFor = (key: string, source: Record<string, string>): string | undefined => {
  if (key in source) return source[key];
  const base = pluralBase(key);
  return source[`${base}_other`];
};

/**
 * Checks a language file against English. Errors make the file unusable (shown when it is loaded
 * in the app, fail `npm run i18n:check`); `en` itself is checked with `source` = its own flat keys.
 */
export const validateLocale = (
  data: unknown,
  source: Record<string, string>,
  isSource = false
): LocaleProblem[] => {
  const problems: LocaleProblem[] = [];
  if (!isObject(data)) {
    return [{ key: '', message: 'The file is not a JSON object.' }];
  }
  const meta = data[META_KEY];
  if (!isObject(meta)) {
    problems.push({ key: META_KEY, message: '"_meta" is missing.' });
  } else {
    if (typeof meta.code !== 'string' || !CODE_PATTERN.test(meta.code)) {
      problems.push({
        key: `${META_KEY}.code`,
        message: '"_meta.code" must be a language code like "de" or "pt-BR".',
      });
    }
    if (typeof meta.name !== 'string' || !meta.name.trim()) {
      problems.push({ key: `${META_KEY}.name`, message: '"_meta.name" is missing.' });
    }
    if (typeof meta.englishName !== 'string' || !meta.englishName.trim()) {
      problems.push({
        key: `${META_KEY}.englishName`,
        message: '"_meta.englishName" is missing.',
      });
    }
    if (
      !Array.isArray(meta.authors) ||
      !meta.authors.every((author) => typeof author === 'string')
    ) {
      problems.push({
        key: `${META_KEY}.authors`,
        message: '"_meta.authors" must be a list of names.',
      });
    }
  }

  // only strings and objects below the areas
  const walk = (node: Record<string, unknown>, prefix: string) => {
    Object.keys(node).forEach((name) => {
      if (!prefix && (name === META_KEY || RESERVED_AREAS.includes(name))) return;
      const value = node[name];
      const key = prefix ? `${prefix}.${name}` : name;
      if (typeof value !== 'string' && !isObject(value)) {
        problems.push({ key, message: 'Must be a text or a group of texts.' });
      } else if (isObject(value)) {
        walk(value, key);
      }
    });
  };
  walk(data, '');

  if (isSource) return problems;

  const flat = flattenLocale(data);
  Object.keys(flat).forEach((key) => {
    if (!knownInSource(key, source)) {
      problems.push({ key, message: 'This key does not exist in en.json.' });
      return;
    }
    const english = sourceTextFor(key, source);
    if (english === undefined) return;
    const wanted = placeholdersOf(english);
    const have = placeholdersOf(flat[key]);
    const plural = isPluralKey(key) || `${key}_other` in source;
    const missing = wanted.filter((name) => !have.includes(name) && !(plural && name === 'count'));
    const extra = have.filter((name) => !wanted.includes(name));
    missing.forEach((name) =>
      problems.push({ key, message: `The placeholder {{${name}}} is missing.` })
    );
    extra.forEach((name) =>
      problems.push({ key, message: `The placeholder {{${name}}} does not exist in English.` })
    );
  });
  return problems;
};

/** Texts to translate: plural forms of one key count once. */
const sourceUnits = (source: Record<string, string>): string[] =>
  Array.from(new Set(Object.keys(source).map(pluralBase)));

/** Share of the English texts that the language translates, 0 to 100 (rounded down). */
export const completionPercent = (
  locale: Record<string, string>,
  source: Record<string, string>
): number => {
  const units = sourceUnits(source);
  if (units.length === 0) return 100;
  const translated = new Set<string>();
  Object.keys(locale).forEach((key) => {
    if (locale[key].trim() && knownInSource(key, source)) translated.add(pluralBase(key));
  });
  const done = units.filter((unit) => translated.has(unit)).length;
  return Math.floor((done / units.length) * 100);
};

/** `{ "a.b": "x" }` -> `{ a: { b: "x" } }`, keys in the order given. */
export const unflattenLocale = (flat: Record<string, string>): LocaleTree => {
  const tree: LocaleTree = {};
  Object.keys(flat).forEach((key) => {
    const parts = key.split('.');
    let node = tree;
    parts.slice(0, -1).forEach((part) => {
      const next = node[part];
      if (!isObject(next)) node[part] = {};
      node = node[part] as LocaleTree;
    });
    node[parts[parts.length - 1]] = flat[key];
  });
  return tree;
};

/**
 * A complete file to translate: every English key in English order, already translated texts
 * kept. English plural forms are listed; languages with more forms add them.
 */
export const localeTemplate = (
  meta: LocaleMeta,
  locale: Record<string, string>,
  source: Record<string, string>
): LocaleFile => {
  const flat: Record<string, string> = {};
  Object.keys(source).forEach((key) => {
    flat[key] = locale[key] ?? source[key];
  });
  // keep extra plural forms of the language (`_few`, `_many` ...) next to the English ones
  Object.keys(locale).forEach((key) => {
    if (!(key in flat) && knownInSource(key, source)) flat[key] = locale[key];
  });
  return { _meta: meta, ...unflattenLocale(flat) } as LocaleFile;
};

/** Short, readable list of problems for the settings page (at most `limit` lines). */
export const describeProblems = (problems: LocaleProblem[], limit = 5): string => {
  const lines = problems
    .slice(0, limit)
    .map((problem) => (problem.key ? `${problem.key}: ${problem.message}` : problem.message));
  if (problems.length > limit) lines.push(`… and ${problems.length - limit} more`);
  return lines.join('\n');
};

/** Best bundled language for the system languages (`de-AT` finds `de`), or undefined. */
export const matchSystemLanguage = (
  systemLanguages: readonly string[],
  available: string[]
): string | undefined => {
  const lower = available.map((code) => code.toLowerCase());
  for (let i = 0; i < systemLanguages.length; i += 1) {
    const wanted = systemLanguages[i].toLowerCase();
    const exact = lower.indexOf(wanted);
    if (exact >= 0) return available[exact];
    const base = wanted.split('-')[0];
    const baseIndex = lower.indexOf(base);
    if (baseIndex >= 0) return available[baseIndex];
    const regional = lower.findIndex((code) => code.split('-')[0] === base);
    if (regional >= 0) return available[regional];
  }
  return undefined;
};
