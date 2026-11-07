// macOS UI checks (WebKit = WKWebView engine). No Matrix account, no hardware. Screenshots land in
// test-results/ui-mac/screens for visual review of overlaps ("UI Überlappung", issues #47/#48/#50).
const { test, expect } = require('@playwright/test');
const { findOverlaps } = require('./helpers.cjs');

// Smallest window the app allows is read from tauri.conf.json when present, else a safe default.
const fs = require('fs');
const path = require('path');
let min = { width: 800, height: 600 };
try {
  const conf = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../src-tauri/tauri.conf.json'), 'utf8')
  );
  const w = (conf.app && conf.app.windows && conf.app.windows[0]) || {};
  min = { width: w.minWidth || min.width, height: w.minHeight || min.height };
} catch (e) {
  /* use default */
}

const SIZES = {
  minimum: min,
  default: { width: 1100, height: 750 },
  large: { width: 1680, height: 1050 },
};

test.beforeEach(async ({ page }) => {
  // Pretend to be the Tauri shell on macOS: enables the macOS-only code paths.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'platform', { get: () => 'MacIntel' });
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === 'connection_profiles') return [];
        return null;
      },
      transformCallback: () => 0,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    };
  });
});

for (const [name, size] of Object.entries(SIZES)) {
  test(`login screen @${name} (${size.width}x${size.height}): no crash, no overflow, no overlap`, async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.getByText('Homeserver').filter({ visible: true }).first()).toBeVisible({
      timeout: 30000,
    });

    // 1. No horizontal scrollbar / clipped content.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);

    // 2. No two visible interactive elements overlap each other.
    const overlaps = await findOverlaps(page);
    expect(overlaps).toEqual([]);

    await page.screenshot({ path: `test-results/ui-mac/screens/login-${name}.png` });

    const fatal = errors.filter((e) => !/fetch|network|net::|abort|load failed/i.test(e));
    expect(fatal).toEqual([]);
  });
}

test('connections button click keeps the login screen intact', async ({ page }) => {
  await page.setViewportSize(SIZES.default);
  await page.goto('/');
  await page.getByRole('button', { name: 'Verbindungen' }).click();
  await expect(page.getByText('Homeserver').filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/ui-mac/screens/connections-dialog.png' });
});
