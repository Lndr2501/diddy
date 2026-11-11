// #157: the profile export asks where to save (system "Save as" window), then writes there.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../src/app/plugins/tauri.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

function setup(chosen) {
  const calls = [];
  const exports = {};
  const window = {
    __TAURI_INTERNALS__: {
      invoke: async (cmd, args, options) => {
        calls.push({ cmd, args, options });
        return cmd === 'plugin:dialog|save' ? chosen : undefined;
      },
    },
  };
  vm.runInNewContext(code, { exports, window, TextEncoder });
  return { ...exports, calls };
}

test('the chosen path gets the file; the dialog is asked for a json file', async () => {
  const env = setup('/Users/x/Documents/my profile.json');
  const saved = await env.saveTextFileAs('diddy-profile.json', '{"a":1}', {
    name: 'Diddy profile',
    extensions: ['json'],
  });
  assert.equal(saved, '/Users/x/Documents/my profile.json');
  assert.equal(env.calls[0].cmd, 'plugin:dialog|save');
  assert.equal(env.calls[0].args.options.defaultPath, 'diddy-profile.json');
  assert.deepEqual(JSON.parse(JSON.stringify(env.calls[0].args.options.filters)), [
    { name: 'Diddy profile', extensions: ['json'] },
  ]);
  assert.equal(env.calls[1].cmd, 'plugin:fs|write_file');
  assert.equal(Buffer.from(env.calls[1].args).toString(), '{"a":1}');
  assert.equal(
    decodeURIComponent(env.calls[1].options.headers.path),
    '/Users/x/Documents/my profile.json'
  );
});

test('cancelling the window writes nothing', async () => {
  const env = setup(null);
  const saved = await env.saveTextFileAs('x.json', '{}', { name: 'x', extensions: ['json'] });
  assert.equal(saved, undefined);
  assert.equal(env.calls.length, 1);
});

test('outside the desktop app it refuses instead of writing somewhere', async () => {
  const exports = {};
  vm.runInNewContext(code, { exports, window: {}, TextEncoder });
  await assert.rejects(exports.saveTextFileAs('x.json', '{}', { name: 'x', extensions: ['json'] }));
});
