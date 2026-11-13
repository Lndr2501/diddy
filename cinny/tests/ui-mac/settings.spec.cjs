// Every settings page (Appearance, Chat, Calls & Audio, Profile incl. badges/profile card, Account, ...) opens
// without errors, horizontal overflow or overlapping controls, at the minimum and default window
// size. Screenshots: test-results/ui-mac/screens/settings-<page>-<size>.png
const { test, expect } = require('@playwright/test');
const { findOverlaps, openApp, dismissOnboarding, accounts } = require('./helpers.cjs');

test.skip(!accounts.testa, 'no test accounts');

const PAGES = [
  'Appearance',
  'Chat',
  'Notifications',
  'Calls & Audio',
  'Profile',
  'Account',
  'Devices',
  'Emojis & Stickers',
  'Plugins',
  'Developer Tools',
  'About',
];
const SIZES = { min: { width: 800, height: 600 }, default: { width: 1100, height: 750 } };

for (const [sizeName, size] of Object.entries(SIZES)) {
  test(`settings pages @${sizeName}: no errors, overflow or overlap`, async ({ browser }) => {
    test.setTimeout(120000);
    const page = await openApp(browser, 'testa', size);
    await dismissOnboarding(page, 4000);
    await page.getByRole('button', { name: 'User settings' }).click();
    const nav = page.getByRole('navigation', { name: 'Settings' });
    await expect(nav).toBeVisible({ timeout: 15000 });

    const problems = [];
    for (const name of PAGES) {
      await dismissOnboarding(page, 300);
      await nav.getByText(name, { exact: true }).first().click();
      await page.waitForTimeout(700);
      const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
      await page.screenshot({ path: `test-results/ui-mac/screens/settings-${slug}-${sizeName}.png` });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 0) problems.push(`${name}: horizontal overflow ${overflow}px`);
      (await findOverlaps(page)).forEach((o) => problems.push(`${name}: overlap ${o}`));
    }
    problems.push(...page.appErrors().map((e) => `page error: ${e}`));
    expect(problems).toEqual([]);
  });
}

// Phones: a settings page covers the menu. Every page needs a visible way back to it (a back arrow,
// not a close cross that looked like it closed all of settings).
test('settings on a phone: every page leads back to the menu', async ({ browser }) => {
  test.setTimeout(120000);
  const page = await openApp(browser, 'testa', { width: 375, height: 667 }, { tauri: false });
  await dismissOnboarding(page, 4000);
  await page.getByRole('button', { name: 'User settings' }).click();
  const nav = page.getByRole('navigation', { name: 'Settings' });
  await expect(nav).toBeVisible({ timeout: 15000 });
  for (const name of PAGES) {
    await dismissOnboarding(page, 300);
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(nav, `${name} covers the menu`).toBeHidden();
    await expect(page.getByRole('button', { name: 'Close settings' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to settings' }).click();
    await expect(nav, `${name} leads back`).toBeVisible();
  }
  expect(page.appErrors()).toEqual([]);
});
