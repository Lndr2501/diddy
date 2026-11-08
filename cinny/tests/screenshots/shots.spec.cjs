// Generates the README preview images into ../docs/screenshots (run: npm run shots).
// Everything shown comes from the fictional team seeded by seed.cjs, never from a real account.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, dismissOnboarding, accounts } = require('../ui-mac/helpers.cjs');
const { seed, setPresence } = require('./seed.cjs');

const OUT = process.env.DIDDY_SHOTS_OUT || path.join(__dirname, '..', '..', '..', 'docs', 'screenshots');
const VIEW = { width: 1280, height: 900 };
const THEMES = [
  ['light-theme', 'light'],
  ['silver-theme', 'silver'],
  ['dark-theme', 'dark'],
  ['daaark-theme', 'daaark'],
  ['butter-theme', 'butter'],
  ['diddy-theme', 'diddy'],
  ['red-theme', 'red'],
  ['green-theme', 'green'],
  ['purple-theme', 'purple'],
  ['amber-theme', 'amber'],
];
const ONLY = process.env.SHOTS_ONLY ? process.env.SHOTS_ONLY.split(',') : null;
const wanted = (name) => !ONLY || ONLY.includes(name);

/** Fresh session per theme (a reload would show a "Connecting..." banner for ~25 s). */
const sessionWithTheme = async (browser, users, themeId) => {
  await setPresence(users); // Synapse lets idle presence time out, so refresh it per session
  const page = await openApp(browser, 'shota', VIEW, {
    tauri: false,
    deviceScaleFactor: 2,
    settings: { useSystemTheme: false, themeId },
  });
  await page.getByText('Direct Messages').first().waitFor({ timeout: 60000 });
  await dismissOnboarding(page, 2500);
  return page;
};

/** Opens the example space and its "general" room, with the member list on the right. */
const openGeneral = async (page) => {
  await page.getByRole('button', { name: 'Northwind Studio' }).first().click();
  await page.getByText('general', { exact: true }).first().click();
  await page.getByText('See you there').first().waitFor({ timeout: 30000 });
  // the timeline opens at the room start; jump to the newest messages
  const jump = page.getByRole('button', { name: 'Jump to Latest' });
  if (await jump.isVisible({ timeout: 3000 }).catch(() => false)) await jump.click();
  // let the image and avatars load
  await page.waitForTimeout(2500);
};

test('README preview images', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const users = await seed();
  test.skip(!accounts.shota, 'no example account');

  for (const [themeId, name] of THEMES) {
    if (!wanted(name)) continue;
    const page = await sessionWithTheme(browser, users, themeId);
    await openGeneral(page);
    await page.screenshot({ path: path.join(OUT, `chat-${name}.png`) });
    await page.context().close();
  }

  if (wanted('settings')) {
    const page = await sessionWithTheme(browser, users, 'diddy-theme');
    await openGeneral(page);
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
  }
});
