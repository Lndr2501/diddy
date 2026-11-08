// Settings > Profile (#105) on the dev preview page (real editor, fake client, sample profile):
// layout at wide / mid / narrow widths, every preview place renders from the draft, no errors.
// Run: npm run test:tiles (Chromium, no Matrix server). Screenshots: test-results/preview/.
const { test, expect } = require('@playwright/test');

const URL = '/preview/profile-editor.html?theme=dark-theme';
const TARGETS = ['Card', 'Window', 'Members', 'DMs', 'Panel', 'Call'];

const open = async (page, size) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize(size);
  await page.goto(URL);
  await expect(page.getByRole('tab', { name: 'Identity' })).toBeVisible({ timeout: 30000 });
  return errors;
};

const rect = (loc) => loc.evaluate((el) => el.getBoundingClientRect().toJSON());

for (const [name, size, columns] of [
  ['wide', { width: 1440, height: 900 }, 'two'],
  ['mid', { width: 1000, height: 800 }, 'two'],
  ['narrow', { width: 700, height: 900 }, 'one'],
  ['phone', { width: 480, height: 900 }, 'one'],
]) {
  test(`profile editor layout @${name}`, async ({ page }) => {
    const errors = await open(page, size);
    const wrap = page.locator('[data-columns]');
    await expect(wrap).toHaveAttribute('data-columns', columns);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);

    const editor = await rect(page.getByRole('tabpanel'));
    const preview = await rect(page.getByRole('complementary', { name: 'Live preview' }));
    const overlapX = Math.min(editor.right, preview.right) - Math.max(editor.left, preview.left);
    const overlapY = Math.min(editor.bottom, preview.bottom) - Math.max(editor.top, preview.top);
    expect(overlapX <= 0 || overlapY <= 0, 'preview column overlaps the editor').toBe(true);

    // every card has the same gap to the next one
    const gaps = await page.getByRole('tabpanel').evaluate((panel) => {
      const cards = [...panel.querySelectorAll(':scope > section')];
      return cards
        .slice(1)
        .map((c, i) =>
          Math.round(c.getBoundingClientRect().top - cards[i].getBoundingClientRect().bottom)
        );
    });
    expect(new Set(gaps).size, `gaps between cards: ${gaps.join(', ')}`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `test-results/preview/profile-editor-${name}.png` });
    expect(errors).toEqual([]);
  });
}

test('every preview place renders and follows the draft', async ({ page }) => {
  const errors = await open(page, { width: 1440, height: 900 });
  const preview = page.getByRole('complementary', { name: 'Live preview' });
  await page.getByRole('tab', { name: 'Profile card' }).click();
  const bio = `Draft bio ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Bio' }).fill(bio);
  await expect(preview.getByText(bio)).toBeVisible();

  for (const target of TARGETS) {
    await preview
      .getByRole('group', { name: 'Preview' })
      .getByRole('button', { name: target })
      .click();
    const stage = preview.locator('[data-preview]');
    await expect(stage).toHaveAttribute('data-preview', target.toLowerCase());
    // something real is drawn: an avatar with the initials or a picture
    await expect(stage.getByText('Lndr').first()).toBeVisible();
    await page.screenshot({
      path: `test-results/preview/profile-preview-${target.toLowerCase()}.png`,
    });
  }

  // the card layouts
  await preview
    .getByRole('group', { name: 'Preview' })
    .getByRole('button', { name: 'Card' })
    .click();
  for (const layout of ['Compact', 'Standard', 'Expanded', 'Tabs']) {
    await preview
      .getByRole('group', { name: 'Card layout shown' })
      .getByRole('button', { name: layout })
      .click();
    await expect(preview.getByText(new RegExp(`${layout} layout`, 'i'))).toBeVisible();
  }

  // a status picked in the draft shows on the member row and the user panel
  await page.getByRole('tab', { name: 'Status & badges' }).click();
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Idle' }).click();
  await preview
    .getByRole('group', { name: 'Preview' })
    .getByRole('button', { name: 'Panel' })
    .click();
  await expect(preview.locator('[data-preview]').getByText('Idle')).toBeVisible();
  expect(errors).toEqual([]);
});

test('reduced motion: previews show stills and say so', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await open(page, { width: 1440, height: 900 });
  const preview = page.getByRole('complementary', { name: 'Live preview' });
  await expect(preview.getByText(/Reduce motion is on/)).toBeVisible();
  // the effect overlay is marked as still
  const animations = await preview
    .locator('[data-effect]')
    .first()
    .evaluate(
      (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length
    );
  expect(animations).toBe(0);
  expect(errors).toEqual([]);
});
