// The desktop app shows no web view menu (Reload / Inspect) except in editable fields.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/plugins/contextMenu.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
}).outputText;

function setup({ desktop, selection } = {}) {
  const mod = {};
  const listeners = [];
  const window = { getSelection: () => selection ?? null };
  const document = { addEventListener: (type, fn) => listeners.push({ type, fn }) };
  vm.runInNewContext(
    compiled,
    {
      exports: mod,
      window,
      document,
      require: (id) => {
        if (id !== './tauri') throw new Error(id);
        return { canInvoke: () => !!desktop };
      },
    },
    { filename }
  );
  return { mod, listeners };
}
const el = (editable) => ({ closest: (sel) => (editable && sel.includes('textarea') ? {} : null) });

test('only editable fields or Option-right-click keep the native menu', () => {
  const { mod } = setup({ desktop: true });
  assert.equal(mod.wantsNativeContextMenu({ target: el(true) }), true);
  assert.equal(mod.wantsNativeContextMenu({ target: el(false) }), false);
  assert.equal(mod.wantsNativeContextMenu({ target: el(false), altKey: true }), true);
  assert.equal(mod.wantsNativeContextMenu({ target: null }), false);
  assert.equal(mod.wantsNativeContextMenu({ target: {} }), false);
});

test('in the desktop app a selection or a link never makes Diddy hand over to the native menu', () => {
  const { mod } = setup({ desktop: true, selection: { isCollapsed: false } });
  assert.equal(mod.deferToNativeMenu({ altKey: false, target: { tagName: 'A' } }), false);
  assert.equal(mod.deferToNativeMenu({ altKey: false, target: { tagName: 'P' } }), false);
});

test('in a plain browser selections and links still use the browser menu', () => {
  const sel = setup({ desktop: false, selection: { isCollapsed: false } });
  assert.equal(sel.mod.deferToNativeMenu({ altKey: false, target: { tagName: 'P' } }), true);
  const link = setup({ desktop: false, selection: { isCollapsed: true } });
  assert.equal(link.mod.deferToNativeMenu({ altKey: false, target: { tagName: 'a' } }), true);
  assert.equal(link.mod.deferToNativeMenu({ altKey: false, target: { tagName: 'P' } }), false);
});

test('the guard is only installed in the desktop app, once per document, and blocks the menu', () => {
  assert.equal(setup({ desktop: false }).listeners.length, 0);
  const { mod, listeners } = setup({ desktop: true });
  mod.installContextMenuGuard();
  mod.installContextMenuGuard();
  assert.equal(listeners.length, 1);
  let prevented = 0;
  const fire = (evt) => listeners[0].fn({ ...evt, preventDefault: () => (prevented += 1) });
  fire({ target: el(false) });
  fire({ target: el(true) });
  fire({ target: el(false), altKey: true });
  assert.equal(prevented, 1);
  // a second document (the call frame) gets its own guard
  const frameListeners = [];
  mod.installContextMenuGuard({
    addEventListener: (type, fn) => frameListeners.push({ type, fn }),
  });
  assert.equal(frameListeners.length, 1);
  assert.equal(frameListeners[0].type, 'contextmenu');
});
