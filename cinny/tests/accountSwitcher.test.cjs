// Server-side render of the account switcher menu with the real component and mocked platform.
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
  '../src/app/components/connection-recovery/AccountSwitcher.tsx'
);
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2016,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

function load({ desktop = true, rows }) {
  const exported = {};
  const imports = {
    react: React,
    folds,
    '../../plugins/tauri': { canInvoke: () => desktop },
    '../../plugins/connections': {
      buildConnectionRows: () => rows,
      getConnectionProfile: () => undefined,
      listConnections: () => Promise.resolve([]),
      openConnection: () => Promise.resolve(),
    },
    './AccountSwitcher.css': new Proxy({}, { get: (_, name) => String(name) }),
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
  return exported;
}

const rows = [
  { id: 'main', title: 'Ursprüngliches Fenster', hint: 'Deine bisherige Anmeldung', current: true },
  {
    id: 'aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa',
    title: 'https://matrix.example.org',
    hint: 'Eigene Anmeldung · aaaaaa',
    current: false,
  },
];

test('menu shows the account, every connection, the current window and the actions', () => {
  const { ConnectionsMenu } = load({ rows });
  const html = renderToStaticMarkup(
    React.createElement(ConnectionsMenu, {
      account: React.createElement('span', null, '@lndr:matrix.example.org'),
      onSettings() {},
      onManage() {},
      onDone() {},
    })
  );
  for (const text of [
    '@lndr:matrix.example.org',
    'Ursprüngliches Fenster',
    'Dieses Fenster',
    'matrix.example.org',
    'Eigene Anmeldung · aaaaaa',
    'Konto oder Server hinzufügen',
    'Einstellungen',
  ]) {
    assert.ok(html.includes(text), `missing: ${text}`);
  }
  // the current window cannot be opened again, the other one can
  assert.match(html, /aria-current="true"[^>]*disabled|disabled[^>]*aria-current="true"/);
  assert.ok(!/Logout|Abmelden|Clear Cache/.test(html), 'no destructive action');
});

test('on the login page there is no account block and no settings entry', () => {
  const { ConnectionsMenu } = load({ rows });
  const html = renderToStaticMarkup(
    React.createElement(ConnectionsMenu, { onManage() {}, onDone() {} })
  );
  assert.ok(!html.includes('Einstellungen'));
  assert.ok(html.includes('Konto oder Server hinzufügen'));
});

test('outside the desktop app the entries are disabled and a hint is shown', () => {
  const { ConnectionsMenu } = load({ desktop: false, rows });
  const html = renderToStaticMarkup(
    React.createElement(ConnectionsMenu, { onManage() {}, onDone() {} })
  );
  assert.ok(
    html.includes('nur in der Diddy-Desktop-App') ||
      html.includes('in der Diddy-Desktop-App verfügbar')
  );
});
