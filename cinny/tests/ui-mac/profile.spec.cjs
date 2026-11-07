// Diddy profile editor (profile card, badges): data room setup, editor layout, saving a bio.
// Relates to the profile-card/badge issues (#27 to #29, #33 to #37).
const { test, expect } = require('@playwright/test');
const { findOverlaps, openApp, dismissOnboarding, accounts } = require('./helpers.cjs');

test.skip(!accounts.testa, 'no test accounts');

const SIZES = { min: { width: 800, height: 600 }, default: { width: 1100, height: 750 } };

for (const [sizeName, size] of Object.entries(SIZES)) {
  test(`profile editor @${sizeName}: data room, layout, save`, async ({ browser }) => {
    test.setTimeout(120000);
    const page = await openApp(browser, 'testa', size);
    await dismissOnboarding(page, 3000);
    await page.getByRole('button', { name: 'User settings' }).click();
    await page.getByRole('navigation', { name: 'Settings' }).getByText('Profile', { exact: true }).click();
    await dismissOnboarding(page, 500);

    // First run on a fresh account: the editor asks for the hidden data room first.
    const setup = page.getByRole('button', { name: 'Create Diddy Options room' });
    if (await setup.isVisible({ timeout: 4000 }).catch(() => false)) await setup.click();

    const identityTab = page.getByRole('tab', { name: 'Identity' });
    await expect(identityTab).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/ui-mac/screens/profile-editor-${sizeName}.png` });

    const problems = [];
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    if (overflow > 0) problems.push(`horizontal overflow ${overflow}px`);
    (await findOverlaps(page)).forEach((o) => problems.push(`overlap ${o}`));

    await page.getByRole('tab', { name: 'Profile card' }).first().click();
    const bio = page.getByRole('textbox', { name: 'Bio' });
    await expect(bio).toBeVisible({ timeout: 15000 });
    const text = `Bio from UI test ${Date.now()}`;
    await bio.fill(text);
    await page.getByRole('button', { name: 'Save changes' }).first().click();
    await expect(page.getByText(/could not save/i)).toHaveCount(0);
    await expect(bio).toHaveValue(text);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/ui-mac/screens/profile-saved-${sizeName}.png` });

    problems.push(...page.appErrors().map((e) => `page error: ${e}`));
    expect(problems).toEqual([]);
  });
}

// KNOWN BUG: the five tabs (Identity, Profile card, images, ...) are wider than their container and
// the last tab is cut off, at every window size. test.fail() keeps the suite green while the bug
// exists and turns red as soon as it is fixed, so this marker is removed then.
test('profile editor tab strip is not cut off', async ({ browser }) => {
  test.fail(true, 'known bug: tab strip wider than its container, last tab cut off');
  test.setTimeout(60000);
  const page = await openApp(browser, 'testa');
  await dismissOnboarding(page, 3000);
  await page.getByRole('button', { name: 'User settings' }).click();
  await page.getByRole('navigation', { name: 'Settings' }).getByText('Profile', { exact: true }).click();
  const tab = page.getByRole('tab', { name: 'Identity' });
  await expect(tab).toBeVisible({ timeout: 30000 });
  const clipped = await tab.evaluate((el) => {
    const row = el.closest('[role=tablist]') || el.parentElement;
    return row.scrollWidth - row.clientWidth;
  });
  expect(clipped, 'px of the tab row that are cut off').toBeLessThanOrEqual(1);
});
