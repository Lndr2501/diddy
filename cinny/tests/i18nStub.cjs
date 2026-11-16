// Stand-ins for react-i18next and src/app/i18n.ts in tests that render components in a vm.
// Texts come from cinny/locales/<language>.json, missing ones from en.json, with the same
// placeholders ({{name}}) and plural suffixes (_one/_other) as the app.
const fs = require('node:fs');
const path = require('node:path');

const flatten = (node, prefix = '', out = {}) => {
  Object.keys(node).forEach((key) => {
    if (!prefix && key === '_meta') return;
    const value = node[key];
    if (typeof value === 'string') out[prefix + key] = value;
    else flatten(value, `${prefix}${key}.`, out);
  });
  return out;
};
const read = (code) =>
  flatten(JSON.parse(fs.readFileSync(path.join(__dirname, '../locales', `${code}.json`), 'utf8')));

const i18nStub = (code = 'en') => {
  const texts = { ...read('en'), ...(code === 'en' ? {} : read(code)) };
  const plural = new Intl.PluralRules(code);
  const t = (key, options = {}) => {
    let text = texts[key];
    if (typeof options.count === 'number') {
      const form = options.count === 0 && texts[`${key}_zero`] ? 'zero' : plural.select(options.count);
      text = texts[`${key}_${form}`] ?? texts[`${key}_other`] ?? text;
    }
    if (text === undefined) return options.defaultValue ?? key;
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(options[name] ?? ''));
  };
  const i18n = { t, language: code };
  return {
    t,
    'react-i18next': { useTranslation: () => ({ t, i18n }) },
    i18n: { translate: t, currentLanguage: () => code, default: i18n },
  };
};

module.exports = { i18nStub };
