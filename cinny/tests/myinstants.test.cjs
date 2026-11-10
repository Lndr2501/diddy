// MyInstants import: myinstants.com loads further search pages by infinite scroll and has no
// rel="next" link any more, so a full page means "there is more" and ?page=N fetches it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2016 },
  }).outputText;

function load(invoke = async () => '') {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compile('../src/app/plugins/myinstants.ts'), {
    exports,
    URL,
    require: (id) => {
      if (id !== './tauri') throw new Error(id);
      return {
        canInvoke: () => true,
        invoke: (cmd, args) => {
          calls.push({ cmd, args });
          return invoke(cmd, args);
        },
      };
    },
  });
  return { mod: exports, calls };
}

const instant = (n) =>
  `<div class="instant"><button class="small-button" onclick="play('/media/sounds/s${n}.mp3', 'loader-${n}', 's${n}')"></button>` +
  `<a href="/en/instant/s${n}/" class="instant-link link-secondary">Sound ${n}</a></div>`;
const page = (count, extra = '') =>
  `<html><body>${Array.from({ length: count }, (_, i) => instant(i)).join(
    '\n'
  )}${extra}</body></html>`;

test('a full page without a next link still has more', () => {
  const { mod } = load();
  assert.equal(mod.hasNextPage(page(36), 36), true);
  assert.equal(mod.hasNextPage(page(mod.FULL_PAGE), mod.FULL_PAGE), true);
});

test('a short page is the last one', () => {
  const { mod } = load();
  assert.equal(mod.hasNextPage(page(7), 7), false);
  assert.equal(mod.hasNextPage(page(0), 0), false);
});

test('an old-style next link is still honoured', () => {
  const { mod } = load();
  assert.equal(
    mod.hasNextPage(page(5, '<a class="page-link" rel="next" href="?page=2">'), 5),
    true
  );
});

test('search fetches ?page=N', async () => {
  const { mod, calls } = load(async () => {
    throw new Error('stop');
  });
  await assert.rejects(mod.searchMyInstants('bruh moment', 3), /stop/);
  assert.equal(calls[0].cmd, 'myinstants_fetch_text');
  assert.equal(
    calls[0].args.url,
    'https://www.myinstants.com/en/search/?name=bruh%20moment&page=3'
  );
});

test('a 404 past the last page is an empty last page', async () => {
  // Tauri rejects with a string ("404 Not Found"), Electron with an Error.
  const failures = ['MyInstants answered 404 Not Found', new Error('MyInstants answered 404')];
  const results = await Promise.all(
    // eslint-disable-next-line prefer-promise-reject-errors
    failures.map((failure) => load(() => Promise.reject(failure)).mod.searchMyInstants('bruh', 8))
  );
  results.forEach((result) => {
    assert.equal(result.items.length, 0);
    assert.equal(result.hasNext, false);
  });
});

test('a 404 on the first page and other errors still fail', async () => {
  // eslint-disable-next-line prefer-promise-reject-errors
  const notFound = load(() => Promise.reject('MyInstants answered 404 Not Found')).mod;
  await assert.rejects(() => notFound.searchMyInstants('bruh', 1));
  // eslint-disable-next-line prefer-promise-reject-errors
  const broken = load(() => Promise.reject('MyInstants answered 500 Internal Server Error')).mod;
  await assert.rejects(() => broken.searchMyInstants('bruh', 2));
});

test('search links keep their page number', () => {
  const { mod } = load();
  const target = mod.parseInput('https://www.myinstants.com/en/search/?name=bruh&page=4');
  assert.equal(target.kind, 'search');
  assert.equal(target.name, 'bruh');
  assert.equal(target.page, 4);
});
