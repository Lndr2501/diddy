// Logged-in macOS UI checks against a local Synapse test server (Docker, see STAND/notes).
// Credentials are NOT in the repo: they are read from DIDDY_TEST_ACCOUNTS (default
// ~/diddy-testserver/accounts.txt, lines "user password"). Skipped when the file is missing.
const { test, expect } = require('@playwright/test');
const { findOverlaps } = require('./helpers.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HS = process.env.DIDDY_TEST_HOMESERVER || 'http://127.0.0.1:8008';
const file =
  process.env.DIDDY_TEST_ACCOUNTS || path.join(os.homedir(), 'diddy-testserver', 'accounts.txt');
const accounts = {};
try {
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((l) => {
      const [u, p] = l.trim().split(/\s+/);
      if (u && p) accounts[u] = p;
    });
} catch (e) {
  /* skipped below */
}

test.skip(!accounts.testa, `no test accounts in ${file}`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'platform', { get: () => 'MacIntel' });
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => (cmd === 'connection_profiles' ? [] : null),
      transformCallback: () => 0,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    };
  });
});

async function login(page, user) {
  await page.goto('/');
  const hs = page.getByRole('textbox').first();
  await hs.fill(HS);
  await hs.press('Enter');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('textbox').nth(1).fill(user);
  await page.locator('input[type=password]').fill(accounts[user]);
  await page.getByRole('button', { name: 'Login' }).click();
}

test('testa can log in and the main layout renders without overlap', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1100, height: 750 });
  await login(page, 'testa');
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/ui-mac/screens/home.png' });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors.filter((e) => !/fetch|network|net::|abort|load failed/i.test(e))).toEqual([]);
});

test('testa skips onboarding and opens the create-room dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 750 });
  await login(page, 'testa');
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/ui-mac/screens/home-after-skip.png' });

  // No two sidebar/title bar controls may overlap once the dialog is gone.
  const overlaps = await findOverlaps(page);
  expect(overlaps).toEqual([]);

  await page.getByRole('button', { name: 'Create Room' }).first().click();
  await page.screenshot({ path: 'test-results/ui-mac/screens/create-room.png' });
});

test('no "Connecting..." banner lingers after a reload on a quiet account', async ({ browser }) => {
  // The first quick sync answers within milliseconds; the banner used to stay until the next
  // (long-poll) response, about 30 s on an account with no new events.
  test.setTimeout(90000);
  const { openApp } = require('./helpers.cjs');
  const page = await openApp(browser, 'testa');
  await page.reload();
  await expect(page.getByRole('button', { name: 'User settings' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Connecting...')).toHaveCount(0, { timeout: 8000 });
});
