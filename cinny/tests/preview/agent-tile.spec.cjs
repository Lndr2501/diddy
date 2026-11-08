// "Redet mit Agent" on a call tile must be readable and clearly visible in every theme.
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
  test(`agent badge and frame are visible in ${theme}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/preview/agent-tile.html?theme=${theme}&agent=1`);
    const badge = page.getByRole('status');
    await expect(badge).toHaveText('Redet mit Agent');
    await expect(page.getByRole('button', { name: 'Anton, redet mit Agent' })).toBeVisible();

    const m = await badge.evaluate((el) => {
      const tile = el.closest('button');
      const s = getComputedStyle(el);
      return {
        bg: s.backgroundColor,
        fg: s.color,
        size: parseFloat(s.fontSize),
        frame: getComputedStyle(tile).boxShadow,
        page: getComputedStyle(document.body).backgroundColor,
        clipped: el.scrollWidth - el.clientWidth,
      };
    });
    // text on the badge: WCAG AA for normal text
    expect(contrast(rgb(m.bg), rgb(m.fg))).toBeGreaterThanOrEqual(4.5);
    // the frame stands out from the page behind the tiles (WCAG non-text: 3:1)
    expect(contrast(rgb(m.frame.split(')')[0] + ')'), rgb(m.page))).toBeGreaterThanOrEqual(3);
    expect(m.size).toBeGreaterThanOrEqual(14);
    expect(m.clipped).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('without an agent there is no badge', async ({ page }) => {
  await page.goto('/preview/agent-tile.html?theme=dark-theme&agent=0');
  await expect(page.getByRole('button', { name: 'Anton' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});
