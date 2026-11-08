// Bot cards (dev.diddy.card, see docs/bot-cards.md) drawn with the real component and CSS in every
// theme: all cards render, nothing overflows or is cut off, text is readable, buttons send commands.
const { test, expect } = require('@playwright/test');

const THEMES = [
  'light-theme',
  'silver-theme',
  'dark-theme',
  'butter-theme',
  'diddy-theme',
  'red-theme',
  'green-theme',
  'purple-theme',
  'amber-theme',
];

const luminance = ([r, g, b]) => {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
};
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

for (const theme of THEMES) {
  test(`bot cards render cleanly in ${theme}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/preview/bot-card.html?theme=${theme}`);
    await expect(page.locator('[data-bot-card]')).toHaveCount(8);
    expect(await page.getByText('invalid card').count()).toBe(0);

    const problems = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-bot-card]').forEach((card, i) => {
        if (card.scrollWidth > card.clientWidth + 1) out.push(`card ${i} overflows horizontally`);
      });
      const bg = (el) => getComputedStyle(el).backgroundColor;
      const chips = [...document.querySelectorAll('[data-state]')].map((el) => ({
        bg: bg(el),
        fg: getComputedStyle(el).color,
      }));
      return { out, chips };
    });
    expect(problems.out).toEqual([]);
    for (const chip of problems.chips) {
      expect(contrast(rgb(chip.bg), rgb(chip.fg))).toBeGreaterThanOrEqual(4.5);
    }
    expect(errors).toEqual([]);
  });
}

test('a card button sends its bot command as a message', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  await page.getByRole('button', { name: /Pause/ }).click();
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!pause']);
});

test('the progress bar of a playing track moves on its own', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const bar = page.getByRole('progressbar').first();
  const first = Number(await bar.getAttribute('aria-valuenow'));
  await expect
    .poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 6000 })
    .toBeGreaterThan(first);
});
