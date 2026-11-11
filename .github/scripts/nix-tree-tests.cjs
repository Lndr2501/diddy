#!/usr/bin/env node
// Runs the unit tests the way the Nix build does: in a copy that holds only the paths
// nix/package.nix puts into each source tree (frontendSrc: cinny/, config.json, docs/plugins;
// shellSrc: electron/ and a few src-tauri files). A test that reads a file outside its tree
// passes in the normal checkout but breaks the Nix build; this catches it on every push, without
// running Nix. The path lists are read from nix/package.nix, so they cannot drift apart.
//
// Usage (repository root, after `npm ci` in cinny/ and electron/): node .github/scripts/nix-tree-tests.cjs
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const nix = fs.readFileSync(path.join(root, 'nix', 'package.nix'), 'utf8');

// name in nix/package.nix -> folder whose tests the Nix build runs there
const TREES = { 'diddy-frontend-source': 'cinny', 'diddy-shell-source': 'electron' };
const SKIP = new Set(['node_modules', 'dist', 'target', '.claude']);

const pathsOf = (name) => {
  const match = new RegExp(`sourceFor\\s+"${name}"\\s*\\[([^\\]]*)\\]`).exec(nix);
  if (!match) throw new Error(`sourceFor "${name}" not found in nix/package.nix`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

let failed = false;
Object.entries(TREES).forEach(([name, testDir]) => {
  const paths = pathsOf(name);
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  paths.forEach((rel) => {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) return;
    fs.cpSync(from, path.join(tree, rel), {
      recursive: true,
      filter: (src) => !SKIP.has(path.basename(src)),
    });
  });
  // the dependencies come from the normal install; Nix installs the same lockfile
  fs.symlinkSync(path.join(root, testDir, 'node_modules'), path.join(tree, testDir, 'node_modules'));
  const tests = fs
    .readdirSync(path.join(tree, testDir, 'tests'))
    .filter((f) => f.endsWith('.test.cjs'))
    .map((f) => path.join('tests', f));
  console.log(`\n== ${name}: ${paths.join(', ')} -> ${tests.length} test files in ${testDir}/`);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
    cwd: path.join(tree, testDir),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failed = true;
    console.error(`\n${name}: tests fail in the Nix source tree. A test probably reads a file`);
    console.error('outside it; skip that test when the file is missing (see tests/altstoreSource.test.cjs).');
  }
  fs.rmSync(tree, { recursive: true, force: true });
});
process.exit(failed ? 1 : 0);
