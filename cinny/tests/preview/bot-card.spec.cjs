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
    await expect(page.locator('[data-bot-card]')).toHaveCount(13);
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

test('a note card shows its link, readable in every tone, opening in a new window', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=light-theme');
  const link = page.locator('[data-bot-card="note"] a');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('Issue öffnen ↗');
  await expect(link).toHaveAttribute('href', 'https://github.com/Lndr2501/diddy/issues/42');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  const box = await link.boundingBox();
  const chip = await link.locator('xpath=..').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(chip.x + chip.width + 1);
});

// The classic cards (no `controls`), so the old checks do not hit the player cards on top
const classic = (page) => page.locator('[data-bot-card]:not([data-player])');
const player = (page) => page.locator('[data-bot-card][data-player]');

test('card buttons mark their command so Diddy hides it in the chat', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  await classic(page).getByRole('button', { name: /Pause/ }).first().click();
  const sent = await page.evaluate(() => window.__sentContent[0]);
  expect(sent).toMatchObject({ msgtype: 'm.text', body: '!pause', 'dev.diddy.card_action': true });
});

test('a card button sends its bot command as a message', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  await classic(page).getByRole('button', { name: /Pause/ }).click();
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!pause']);
});

test('the progress bar of a playing track moves on its own', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const bar = classic(page).getByRole('slider').first();
  const first = Number(await bar.getAttribute('aria-valuenow'));
  await expect
    .poll(async () => Number(await bar.getAttribute('aria-valuenow')), { timeout: 6000 })
    .toBeGreaterThan(first);
});

test('a click on the timeline seeks to that point (sends the seek command)', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const bar = classic(page).getByRole('slider').first();
  await bar.scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(classic(page).getByText(/^1:3[789]$/)).toBeVisible(); // time tip under the pointer (half of 3:17)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() => page.evaluate(() => window.__sent))
    .toEqual([expect.stringMatching(/^!seek 1:3[789]$/)]);
});

test('arrow keys on the timeline seek by 10 seconds', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  await classic(page).getByRole('slider').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!seek +10']);
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!seek +10', '!seek -10']);
});

test('volume buttons and the volume display are on the card', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  await expect(classic(page).getByText('🔊 60').first()).toBeVisible();
  await classic(page).getByRole('button', { name: '🔊 +' }).first().click();
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!volume +10']);
  await page.waitForTimeout(900);
  await classic(page).getByRole('button', { name: '🔉 −' }).first().click();
  await expect
    .poll(() => page.evaluate(() => window.__sent))
    .toEqual(['!volume +10', '!volume -10']);
});

test('a paused card has a slider too but its bar does not move', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const paused = classic(page).getByRole('slider').nth(1);
  const before = await paused.getAttribute('aria-valuenow');
  await page.waitForTimeout(2500);
  expect(await paused.getAttribute('aria-valuenow')).toBe(before);
});

for (const theme of THEMES) {
  test(`the player card looks like a player in ${theme}`, async ({ page }) => {
    await page.goto(`/preview/bot-card.html?theme=${theme}`);
    const card = player(page).first();
    await expect(card.getByText('Now playing in Lounge')).toBeVisible();
    await expect(card.getByText('The Midnight Drivers · requested by Luis')).toBeVisible();
    await expect(card.getByText('Up next')).toBeVisible();
    await expect(card.getByText('Paper Planets · Kim & the Comets')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Volume 70%' })).toBeVisible();
    // `controls` present: the old `actions` buttons are not drawn
    await expect(card.getByText('Old Pause')).toHaveCount(0);
    const look = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      const primary = el.querySelector('button[data-primary]');
      const pcs = getComputedStyle(primary);
      const fill = el.querySelector('[role=slider] div div');
      return {
        stripe: cs.borderLeftWidth,
        stripeColor: cs.borderLeftColor,
        primaryBg: pcs.backgroundColor,
        primaryFg: pcs.color,
        fill: getComputedStyle(fill).backgroundColor,
        overflow: el.scrollWidth > el.clientWidth + 1,
      };
    });
    expect(look.stripe).toBe('4px');
    expect(look.fill).toBe(look.stripeColor);
    expect(look.primaryBg).toBe(look.stripeColor);
    expect(contrast(rgb(look.primaryBg), rgb(look.primaryFg))).toBeGreaterThanOrEqual(3);
    expect(look.overflow).toBe(false);
    const paused = player(page).nth(1);
    await expect(paused.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(paused.getByText('requested by Autoplay')).toBeVisible();
  });
}

test('player buttons send the control commands', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const card = player(page).first();
  await card.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!pause']);
  await page.waitForTimeout(800);
  await card.getByRole('button', { name: 'Skip' }).click();
  await page.waitForTimeout(800);
  await card.getByRole('button', { name: 'Previous' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__sent))
    .toEqual(['!pause', '!skip', '!previous']);
  const sent = await page.evaluate(() => window.__sentContent);
  expect(sent.every((c) => c['dev.diddy.card_action'] === true)).toBe(true);
  await page.waitForTimeout(800);
  await player(page).nth(1).getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => page.evaluate(() => window.__sent.at(-1))).toBe('!resume');
});

test('the volume button opens a slider that sends the new volume on release', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const card = player(page).first();
  await card.getByRole('button', { name: 'Volume 70%' }).click();
  const slider = card.getByRole('slider', { name: 'Volume' });
  await expect(slider).toBeVisible();
  expect(await slider.getAttribute('max')).toBe('150');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!volume 71']);
  await page.keyboard.press('Escape');
  await expect(slider).toHaveCount(0);
});

test('the ⋯ menu lists the extra commands and sends one', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const card = player(page).first();
  await card.getByRole('button', { name: 'More' }).click();
  const menu = card.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(5);
  await menu.getByRole('menuitem', { name: '🔁 Loop' }).click();
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!loop']);
  await expect(card.getByRole('menu')).toHaveCount(0);
});

test('the player timeline still seeks', async ({ page }) => {
  await page.goto('/preview/bot-card.html?theme=dark-theme');
  const bar = player(page).first().getByRole('slider', { name: 'Wiedergabe' });
  await bar.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__sent)).toEqual(['!seek +10']);
});
