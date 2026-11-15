// Starts the packaged app and checks that the window comes up with Diddy's page, the desktop API and
// the log in the platform's folder. No accounts, no network. Used for the Windows installer build:
//   node electron/tests/start-smoke.cjs electron/dist/win-unpacked/Diddy.exe
// (further arguments go to the app, e.g. `node_modules/.bin/electron . --no-sandbox` while developing)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
// The Windows job installs only playwright-core (NODE_PATH); elsewhere the frontend's copy is used.
const { chromium } = (() => {
  try {
    return require('playwright-core');
  } catch {
    return require('../../cinny/node_modules/playwright');
  }
})();

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diddy-start-'));
  // A private profile, so the test neither reads nor touches a real installation.
  const env = {
    ...process.env,
    APPDATA: path.join(dir, 'roaming'),
    LOCALAPPDATA: path.join(dir, 'local'),
    XDG_CONFIG_HOME: path.join(dir, 'config'),
    XDG_DATA_HOME: path.join(dir, 'data'),
    XDG_STATE_HOME: path.join(dir, 'state'),
  };
  const app = spawn(path.resolve(process.argv[2]), [...process.argv.slice(3), '--remote-debugging-port=0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error(`Electron startup: ${log.slice(-2000)}`)), 60000);
      app.stderr.on('data', (data) => {
        log += data;
        const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      app.once('error', reject);
      app.once('exit', (code) => reject(new Error(`Electron exited with ${code}: ${log.slice(-2000)}`)));
    });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    context.setDefaultTimeout(60000);
    const page = context.pages()[0] ?? (await context.waitForEvent('page'));
    await page.waitForURL('http://localhost:44548/**');
    await page.waitForFunction(() => !!document.getElementById('root')?.childElementCount);
    const shell = await page.evaluate(() => ({
      invoke: typeof window.__TAURI_INTERNALS__?.invoke === 'function',
      systemAudio: !!window.__DIDDY_SYS_AUDIO__,
    }));
    assert.ok(shell.invoke, 'the desktop API is missing');
    // the system-audio bridge exists only where its helper is shipped (Linux)
    assert.equal(shell.systemAudio, process.platform === 'linux');
    const logFile = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('log_path'));
    const expected = process.platform === 'win32' ? env.LOCALAPPDATA : env.XDG_STATE_HOME;
    assert.ok(logFile.startsWith(expected), `log at ${logFile}, expected below ${expected}`);
    assert.match(fs.readFileSync(logFile, 'utf8'), new RegExp(`started \\(${process.platform} `));
    console.log(`start smoke ok: ${await page.title()} ${page.url()} log=${logFile}`);
  } finally {
    await browser?.close().catch(() => undefined);
    app.kill();
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
