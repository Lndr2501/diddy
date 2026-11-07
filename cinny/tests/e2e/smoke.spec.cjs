// Playwright smoke test for the built web bundle (issue #16): catches blank screens, syntax
// errors in the bundle and crash-before-render regressions. No Matrix account or hardware needed.
const { test, expect } = require('@playwright/test');

test('the app boots into the login screen instead of a blank page', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto('/');
  await expect(page).toHaveTitle('Diddy');
  await expect(page.locator('#root')).not.toBeEmpty();

  // The login screen shows the homeserver controls once React has booted and config.json loaded.
  // (filter on visibility: the closed connection dialog also mentions "Homeserver".)
  await expect(
    page.getByText('Homeserver').filter({ visible: true }).first()
  ).toBeVisible({ timeout: 30000 });

  // A failed homeserver probe may reject asynchronously; nothing may crash the page itself.
  const fatal = pageErrors.filter((e) => !/fetch|network|net::|abort/i.test(e));
  expect(fatal).toEqual([]);
});

test('the saved connections entry point is reachable on the login screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Verbindungen' })).toBeVisible({
    timeout: 30000,
  });
});
