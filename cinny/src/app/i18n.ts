// UI languages (docs/translating.md). One file per language in cinny/locales/<code>.json; English
// is bundled and the fallback for every missing text, the others load when chosen. Files loaded in
// the settings (state/language.ts) override a bundled language with the same code.
import i18n, { TOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import dayjs from 'dayjs';
import en from '../../locales/en.json';
import {
  LocaleFile,
  LocaleMeta,
  flattenLocale,
  matchSystemLanguage,
} from './utils/localeFiles';
import { SYSTEM_LANGUAGE, readCustomLanguages, readLanguagePref } from './state/language';
import { canInvoke, invoke } from './plugins/tauri';
import { isMacOS } from './utils/user-agent';

export const SOURCE_LANGUAGE = 'en';

const english = en as unknown as LocaleFile;
const bundledFiles = import.meta.glob<LocaleFile>(['../../locales/*.json', '!../../locales/en.json'], {
  import: 'default',
});
const codeOfPath = (file: string): string => file.replace(/^.*\/([^/]+)\.json$/, '$1');
const bundledLoaders: Record<string, () => Promise<LocaleFile>> = { en: async () => english };
Object.keys(bundledFiles).forEach((file) => {
  bundledLoaders[codeOfPath(file)] = bundledFiles[file];
});

/** English texts by flat key (`settings.appearance.theme`). */
export const sourceTexts = (): Record<string, string> => flattenLocale(english);

export const bundledLanguageCodes = (): string[] => Object.keys(bundledLoaders).sort();

/** Bundled and loaded languages, codes sorted. */
export const availableLanguageCodes = (): string[] =>
  Array.from(new Set([...bundledLanguageCodes(), ...Object.keys(readCustomLanguages())])).sort();

/** The language file for a code: a loaded file wins over the bundled one. */
export const loadLanguageFile = async (code: string): Promise<LocaleFile | undefined> => {
  const custom = readCustomLanguages()[code];
  if (custom) return custom;
  const loader = bundledLoaders[code];
  if (!loader) return undefined;
  try {
    return await loader();
  } catch {
    return undefined;
  }
};

export const loadBundledLanguageFile = async (code: string): Promise<LocaleFile | undefined> =>
  bundledLoaders[code]?.();

export const sourceMeta = (): LocaleMeta => english._meta;

const systemLanguages = (): readonly string[] =>
  typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];

/** The language code a setting stands for (`system` resolved against the system languages). */
export const resolveLanguage = (pref: string): string => {
  const available = availableLanguageCodes();
  if (pref !== SYSTEM_LANGUAGE && available.includes(pref)) return pref;
  return matchSystemLanguage(systemLanguages(), available) ?? SOURCE_LANGUAGE;
};

const stripMeta = (file: LocaleFile): Record<string, unknown> => {
  const texts: Record<string, unknown> = { ...file };
  delete texts._meta;
  return texts;
};

// Month and day names for dates formatted by the app, taken from the system for any language.
const intlNames = (code: string, options: Intl.DateTimeFormatOptions, dates: Date[]): string[] => {
  const format = new Intl.DateTimeFormat(code, options);
  return dates.map((date) => format.format(date));
};
const applyDateLocale = (code: string) => {
  if (code === SOURCE_LANGUAGE) {
    dayjs.locale('en');
    return;
  }
  try {
    const months = Array.from({ length: 12 }, (_, m) => new Date(2021, m, 15));
    // 3 January 2021 was a Sunday, dayjs starts its lists on Sunday
    const days = Array.from({ length: 7 }, (_, d) => new Date(2021, 0, 3 + d));
    dayjs.locale(
      {
        name: code,
        months: intlNames(code, { month: 'long' }, months),
        monthsShort: intlNames(code, { month: 'short' }, months),
        weekdays: intlNames(code, { weekday: 'long' }, days),
        weekdaysShort: intlNames(code, { weekday: 'short' }, days),
        weekdaysMin: intlNames(code, { weekday: 'narrow' }, days),
        ordinal: (n: number) => `${n}.`,
      } as unknown as ILocale,
      undefined,
      true
    );
    dayjs.locale(code);
  } catch {
    dayjs.locale('en');
  }
};

// The Linux/Windows shell (Electron) shows its own right-click menu and screen picker; it gets
// the texts of the `native` area with the language.
const tellShell = (code: string) => {
  if (!canInvoke() || isMacOS()) return;
  const prefix = 'native.';
  const strings: Record<string, string> = {};
  Object.keys(sourceTexts())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => {
      strings[key.slice(prefix.length)] = i18n.t(key);
    });
  invoke('set_ui_language', { code, strings }).catch(() => undefined);
};

i18n.use(initReactI18next).init({
  resources: { en: { translation: stripMeta(english) } },
  lng: SOURCE_LANGUAGE,
  fallbackLng: SOURCE_LANGUAGE,
  // keys are plain dotted paths, ":" in a text is no namespace
  nsSeparator: false,
  returnEmptyString: false,
  returnNull: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

/** Switches the UI to a setting (`system` or a code). Resolves once the texts are there. */
export const applyLanguage = async (pref: string = readLanguagePref()): Promise<string> => {
  let code = resolveLanguage(pref);
  if (code !== SOURCE_LANGUAGE) {
    const file = await loadLanguageFile(code);
    // replaced, not merged: a removed custom file must not leave its texts behind
    if (i18n.hasResourceBundle(code, 'translation')) i18n.removeResourceBundle(code, 'translation');
    if (file) i18n.addResourceBundle(code, 'translation', stripMeta(file));
    else code = SOURCE_LANGUAGE;
  }
  applyDateLocale(code);
  await i18n.changeLanguage(code);
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  tellShell(code);
  return code;
};

/** Texts outside of components (lists, helpers). Components use `useTranslation()`. */
export const translate = (key: string, options?: TOptions): string => i18n.t(key, options);

let englishKeys: Map<string, string> | undefined;
/**
 * The UI-language text for an English text that is in en.json (the settings search index lists
 * English titles); unknown texts come back as they are.
 */
export const translateEnglish = (text: string): string => {
  if (!englishKeys) {
    const keys = new Map<string, string>();
    const texts = sourceTexts();
    Object.keys(texts).forEach((key) => {
      const known = keys.get(texts[key]);
      // settings keys win: the search index lists settings titles
      if (!known || (!known.startsWith('settings.') && key.startsWith('settings.'))) {
        keys.set(texts[key], key);
      }
    });
    englishKeys = keys;
  }
  const key = englishKeys.get(text);
  return key ? i18n.t(key) : text;
};

/** Current language for `Intl` and `toLocale*String`. */
export const currentLanguage = (): string => i18n.language || SOURCE_LANGUAGE;

export default i18n;
