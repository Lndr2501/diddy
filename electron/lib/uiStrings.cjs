// Texts of the shell's own windows and menus (right-click menu, screen picker) in the UI language.
// The page sends them with `set_ui_language` whenever the language changes (cinny/src/app/i18n.ts,
// area `native` of cinny/locales/<code>.json); until then the English texts below are used.

const DEFAULTS = {
  noSuggestions: 'No suggestions',
  addToDictionary: 'Add to dictionary',
  copyLink: 'Copy link',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select all',
  pickerTitle: 'Share screen or window',
  pickerHeading: 'What do you want to share?',
  pickerHint: 'Choose a screen or a window.',
  pickerSources: 'Available screens and windows',
  pickerCancel: 'Cancel',
};

const MAX_TEXT = 200;
const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

let language = 'en';
let texts = { ...DEFAULTS };

/** Takes the texts from the page: only known names and short plain strings, the rest stays English. */
const setUiLanguage = ({ code, strings } = {}) => {
  const next = { ...DEFAULTS };
  if (strings && typeof strings === 'object') {
    Object.keys(DEFAULTS).forEach((name) => {
      const value = strings[name];
      if (typeof value === 'string' && value.trim() && value.length <= MAX_TEXT) next[name] = value;
    });
  }
  texts = next;
  language = typeof code === 'string' && CODE.test(code) ? code : 'en';
  return null;
};

const uiText = (name) => texts[name] ?? DEFAULTS[name] ?? name;
const uiLanguage = () => language;

module.exports = { setUiLanguage, uiText, uiLanguage, DEFAULTS };
