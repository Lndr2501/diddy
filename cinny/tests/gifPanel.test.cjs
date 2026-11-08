// Issue #82: the GIF tab renders a setup hint without a key, and the active provider's search
// placeholder and attribution with one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const folds = require('folds');

const compile = (file, jsx) =>
  ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2016,
      jsx: jsx ? ts.JsxEmit.React : undefined,
      esModuleInterop: true,
    },
  }).outputText;

const gifSource = compile('../src/app/plugins/gifSearch.ts');
const panelFile = path.join(__dirname, '../src/app/components/emoji-board/GifPanel.tsx');
const panelSource = compile('../src/app/components/emoji-board/GifPanel.tsx', true);

function render(prefs) {
  const gif = {};
  vm.runInNewContext(gifSource, { exports: gif, URL, URLSearchParams });
  const imports = {
    react: React,
    folds,
    '../../plugins/gifSearch': gif,
    '../../state/gifPrefs': {
      useGifPrefs: () => prefs,
      activeGifKey: (p) => (p.enabled ? p.keys[p.provider] || undefined : undefined),
      getGifCustomerId: () => 'device-id',
    },
    '../../hooks/useDebounce': { useDebounce: (fn) => fn },
    '../../utils/user-agent': { mobileOrTablet: () => false },
    '../../utils/keyboard': { preventScrollWithArrowKey: () => undefined },
    './components/styles.css': new Proxy({}, { get: (_, name) => String(name) }),
  };
  const exported = {};
  vm.runInNewContext(
    panelSource,
    {
      exports: exported,
      require: (name) => {
        if (!(name in imports)) throw new Error(`Unexpected UI dependency: ${name}`);
        return imports[name];
      },
    },
    { filename: panelFile }
  );
  return renderToStaticMarkup(
    React.createElement(exported.GifPanel, {
      onSelect: async () => undefined,
      requestClose: () => undefined,
    })
  );
}

const base = { enabled: true, provider: 'giphy', rating: 'g', keys: { giphy: '', klipy: '' } };

test('without a key the GIF tab explains where to set it up', () => {
  const html = render(base);
  assert.match(html, /GIF search is not set up/);
  assert.match(html, /Settings &gt; General &gt; GIFs/);
  assert.doesNotMatch(html, /Powered by/);
});

test('with a GIPHY key the search and GIPHY attribution are shown', () => {
  const html = render({ ...base, keys: { giphy: 'abcdefgh1234', klipy: '' } });
  assert.match(html, /placeholder="Search GIPHY"/);
  assert.match(html, /Powered by GIPHY/);
});

test('with KLIPY active its required placeholder and attribution are shown', () => {
  const html = render({ ...base, provider: 'klipy', keys: { giphy: '', klipy: 'abcdefgh1234' } });
  assert.match(html, /placeholder="Search KLIPY"/);
  assert.match(html, /Powered by KLIPY/);
  assert.doesNotMatch(html, /GIPHY/);
});
