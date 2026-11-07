// Every settings page (General, Appearance, Profile incl. badges/profile card, Account, ...) opens
// without errors, horizontal overflow or overlapping controls, at the minimum and default window
// size. Screenshots: test-results/ui-mac/screens/settings-<page>-<size>.png
const { test, expect } = require('@playwright/test');
const { findOverlaps, openApp, dismissOnboarding, accounts } = require('./helpers.cjs');

test.skip(!accounts.testa, 'no test accounts');

const PAGES = [
  'General',
  'Appearance',
  'Profile',
  'Account',
  'Notifications',
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
