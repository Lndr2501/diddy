// "Talking to agent" (#57) in the profile card (user panel, bottom left): while the dictation
// hotkey is active the card lights up, the picture grows and gets a ring, and a filled badge says
// "Talking to agent". Screenshots: test-results/ui-mac/screens/agent-{idle,talking}.png
const { test, expect } = require('@playwright/test');
const { openApp, accounts } = require('./helpers.cjs');

test.skip(!accounts.testa, 'no test accounts');

const HOTKEY = { code: 'Backquote', ctrl: false, alt: false, shift: false, meta: false };

test('talking to an agent is clearly visible on the profile card', async ({ browser }) => {
  test.setTimeout(90000);
  const page = await openApp(
    browser,
    'testa',
    { width: 1100, height: 750 },
    {
      deviceScaleFactor: 2,
      storage: { diddyAgentVoice: { enabled: true, hotkey: HOTKEY, mode: 'toggle', share: true } },
    }
  );
  const card = page.getByRole('button', { name: /^Account and status/ });
  await expect(card).toBeVisible({ timeout: 30000 });
  const avatar = card.locator('span').first();
  const idleBox = await avatar.boundingBox();
  await expect(card).not.toHaveAttribute('data-agent', /.*/);
  await card.screenshot({ path: 'test-results/ui-mac/screens/agent-idle.png' });

  // toggle mode: one press starts "talking to agent", the next one ends it
  await page.keyboard.press('Backquote');
  const badge = card.getByRole('status');
  await expect(badge).toHaveText('Agent');
  await expect(badge).toHaveAttribute('aria-label', 'Talking to agent');
  await expect(card).toHaveAttribute('data-agent', 'true');

  // the whole badge text is visible (not cut off by the narrow card)
  const clipped = await badge.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(clipped).toBeLessThanOrEqual(1);

  // the picture is bigger than before, and the badge is a filled pill, not grey small text
  const talkingBox = await avatar.boundingBox();
  expect(talkingBox.width).toBeGreaterThan(idleBox.width);
  const style = await badge.evaluate((el) => {
    const c = getComputedStyle(el);
    return { bg: c.backgroundColor, size: parseFloat(c.fontSize), weight: Number(c.fontWeight) };
  });
  expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.size).toBeGreaterThanOrEqual(12);
  expect(style.weight).toBeGreaterThanOrEqual(600);
  await page.waitForTimeout(400);
  await card.screenshot({ path: 'test-results/ui-mac/screens/agent-talking.png' });
  await page.screenshot({ path: 'test-results/ui-mac/screens/agent-talking-full.png' });

  await page.keyboard.press('Backquote');
  await expect(badge).toHaveCount(0, { timeout: 5000 });
  await expect(card).not.toHaveAttribute('data-agent', /.*/);
});
