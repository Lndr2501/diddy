// Generates the README preview images into ../docs/screenshots (run: npm run shots).
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, dismissOnboarding, accounts } = require('../ui-mac/helpers.cjs');
const { seed } = require('./seed.cjs');

const OUT = path.join(__dirname, '..', '..', '..', 'docs', 'screenshots');
const VIEW = { width: 1280, height: 800 };
const THEMES = [
  ['light-theme', 'light'],
  ['silver-theme', 'silver'],
  ['dark-theme', 'dark'],
  ['butter-theme', 'butter'],
  ['diddy-theme', 'diddy'],
  ['red-theme', 'red'],
  ['green-theme', 'green'],
  ['purple-theme', 'purple'],
  ['amber-theme', 'amber'],
];

/** Opens every room once so no unread badges show up, ends in "Allgemein". */
const readAllRooms = async (page) => {
  for (const room of ['Ideen', 'Musik & Sound', 'Allgemein']) {
    await page.getByText(room, { exact: true }).first().click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1200);
};

/** Fresh session per theme (a reload would show a "Connecting..." banner for ~25 s). */
const sessionWithTheme = async (browser, themeId) => {
  const page = await openApp(browser, 'shota', VIEW, {
    tauri: false,
    deviceScaleFactor: 2,
    settings: { useSystemTheme: false, themeId },
  });
  await page.getByText('Allgemein').first().waitFor({ timeout: 60000 });
  await dismissOnboarding(page, 2500);
  return page;
};

test('README preview images', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await seed();
  test.skip(!accounts.shota, 'no shota account');

  for (const [themeId, name] of THEMES) {
    const page = await sessionWithTheme(browser, themeId);
    await readAllRooms(page);
    await page.getByText('Diddy-Nutzer').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `chat-${name}.png`) });
    await page.context().close();
  }

  // Settings and profile in the Diddy theme.
  const page = await sessionWithTheme(browser, 'diddy-theme');
  await readAllRooms(page);
  await page.getByRole('button', { name: 'User settings' }).click();
  const nav = page.getByRole('navigation', { name: 'Settings' });
  await nav.getByText('Appearance', { exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'settings-appearance.png') });
  await nav.getByText('Profile', { exact: true }).click();
  const setup = page.getByRole('button', { name: 'Create Diddy Options room' });
  if (await setup.isVisible({ timeout: 4000 }).catch(() => false)) await setup.click();
  await page.getByRole('tab', { name: 'Profile card' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'settings-profile.png') });
});
