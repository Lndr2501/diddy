// Server-side render of the real connection recovery page for every phase (no browser needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const folds = require('folds');

const filename = path.join(
  __dirname,
  '../src/app/components/connection-recovery/ConnectionRecovery.tsx'
);
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2016,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;
const css = new Proxy({}, { get: (_, name) => String(name) });
const exported = {};
const imports = {
  react: React,
  folds,
  'focus-trap-react': ({ children }) => children,
  '../../utils/keyboard': { stopPropagation: () => false },
  '../splash-screen': {
    SplashScreen: ({ children }) => React.createElement('main', null, children),
  },
  '../../plugins/tauri': { canInvoke: () => true },
  '../../plugins/connections': {
    buildConnectionRows: () => [
      { id: 'main', title: 'Ursprüngliches Fenster', hint: '', current: true },
    ],
    getConnectionProfile: () => undefined,
    visibleHomeserver: (url) => url.replace(/\/$/, ''),
    listConnections: () => Promise.resolve([]),
    openConnection: () => Promise.resolve(),
    createConnection: () => Promise.resolve(),
  },
  './AccountSwitcher': { ConnectionsMenu: () => null },
  './AccountSwitcher.css': css,
  './ConnectionRecovery.css': css,
};
vm.runInNewContext(
  output,
  {
    exports: exported,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected UI dependency: ${name}`);
      return imports[name];
    },
  },
  { filename }
);

for (const phase of ['connecting', 'unreachable', 'syncing', 'initializing', 'error']) {
  test(`recovery page offers retry and another server in phase ${phase}, nothing destructive`, () => {
    const html = renderToStaticMarkup(
      React.createElement(exported.ConnectionRecovery, {
        baseUrl: 'http://127.0.0.1:8008',
        phase,
        onRetry() {},
      })
    );
    assert.ok(html.includes('Anderen Server verbinden'));
    assert.ok(html.includes('Erneut versuchen'));
    assert.ok(html.includes('127.0.0.1:8008'));
    assert.ok(!html.includes('Logout') && !html.includes('Clear Cache'));
  });
}

test('the connections button renders as a closed menu trigger', () => {
  const html = renderToStaticMarkup(React.createElement(exported.ConnectionsButton));
  assert.ok(html.includes('aria-haspopup="menu"'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('Verbindungen'));
});
