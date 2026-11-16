// The chosen UI language and the language files loaded in the app, both kept on this device.
import type { LocaleFile } from '../utils/localeFiles';

const PREF_KEY = 'diddy-language';
const CUSTOM_KEY = 'diddy-custom-languages';

/** `system` follows the system language; otherwise a language code (`de`, `pt-BR` ...). */
export const SYSTEM_LANGUAGE = 'system';

export const readLanguagePref = (): string => {
  try {
    return localStorage.getItem(PREF_KEY) || SYSTEM_LANGUAGE;
  } catch {
    return SYSTEM_LANGUAGE;
  }
};

export const writeLanguagePref = (pref: string): void => {
  try {
    if (pref === SYSTEM_LANGUAGE) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    // private mode: the choice lasts until the window closes
  }
};

/** Language files loaded with "Load language file…", by code. */
export const readCustomLanguages = (): Record<string, LocaleFile> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeCustomLanguages = (files: Record<string, LocaleFile>): void => {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(files));
};

/** Throws when the storage is full or blocked. */
export const saveCustomLanguage = (file: LocaleFile): void => {
  writeCustomLanguages({ ...readCustomLanguages(), [file._meta.code]: file });
};

export const removeCustomLanguage = (code: string): void => {
  const files = readCustomLanguages();
  delete files[code];
  try {
    writeCustomLanguages(files);
  } catch {
    // nothing stored, nothing to remove
  }
};
