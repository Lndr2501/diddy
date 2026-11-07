// Shared helpers for the macOS UI specs.

/** Returns descriptions of visibly overlapping interactive elements (empty = none).
 * Elements clipped by a scroll/overflow container (e.g. long room lists) are not counted. */
const findOverlaps = (page) =>
  page.evaluate(() => {
    const desc = (e) =>
      `${e.tagName.toLowerCase()} "${(e.getAttribute('aria-label') || e.textContent || '')
        .trim()
        .slice(0, 30)}"`;
    const clippedAt = (el, x, y) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(o.overflow + o.overflowX + o.overflowY)) {
          const r = p.getBoundingClientRect();
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true;
        }
      }
      return false;
    };
    const els = [...document.querySelectorAll('button, input, a[href], select, textarea')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const found = [];
    for (let i = 0; i < els.length; i += 1) {
      for (let j = i + 1; j < els.length; j += 1) {
        const a = els[i];
        const b = els[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const left = Math.max(a.r.left, b.r.left);
        const right = Math.min(a.r.right, b.r.right);
        const top = Math.max(a.r.top, b.r.top);
        const bottom = Math.min(a.r.bottom, b.r.bottom);
        if (right - left <= 2 || bottom - top <= 2) continue;
        const cx = (left + right) / 2;
        const cy = (top + bottom) / 2;
        if (clippedAt(a.el, cx, cy) || clippedAt(b.el, cx, cy)) continue;
        // Elements under a modal/backdrop are not really overlapping: another layer lies between.
        const stack = document.elementsFromPoint(cx, cy);
        const idx = (x) => stack.findIndex((n) => n === x || x.contains(n));
        const ia = idx(a.el);
        const ib = idx(b.el);
        if (ia < 0 || ib < 0) continue;
        const between = stack.slice(Math.min(ia, ib) + 1, Math.max(ia, ib));
        if (between.some((n) => !a.el.contains(n) && !b.el.contains(n) && !n.contains(a.el) && !n.contains(b.el))) continue;
        found.push(`${desc(a.el)} <-> ${desc(b.el)}`);
      }
    }
    return found;
  });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('@playwright/test');

const HS = process.env.DIDDY_TEST_HOMESERVER || 'http://127.0.0.1:8008';
const accountsFile =
  process.env.DIDDY_TEST_ACCOUNTS || path.join(os.homedir(), 'diddy-testserver', 'accounts.txt');
const accounts = {};
try {
  fs.readFileSync(accountsFile, 'utf8')
    .split('\n')
    .forEach((l) => {
      const [u, p] = l.trim().split(/\s+/);
      if (u && p) accounts[u] = p;
    });
} catch (e) {
  /* specs skip themselves when no accounts exist */
}

/** Closes the onboarding dialogs (English "Skip", German "Überspringen"); some appear late. */
async function dismissOnboarding(page, wait = 2500) {
  const skip = page.getByRole('button', { name: /^(Skip|Überspringen)$/ });
  for (let i = 0; i < 6; i += 1) {
    if (!(await skip.first().isVisible({ timeout: wait }).catch(() => false))) return;
    await skip.first().click({ timeout: 3000 }).catch(() => undefined);
  }
}

/** Opens the app in a fresh WebKit context as macOS + mocked Tauri, logs in and skips onboarding. */
async function openApp(browser, user, viewport = { width: 1100, height: 750 }) {
  const context = await browser.newContext({ viewport });
  // The German intro ("Matrix für Discord-Umsteiger") pops up 4 s after load and would cover the
  // UI under test: mark it as seen unless a test wants it (options.intro = true).
  await context.addInitScript((id) => {
    try {
      localStorage.setItem(`diddy-intro-seen:${id}`, '1');
    } catch (e) {
      /* storage unavailable */
    }
  }, `@${user}:localhost`);
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, 'platform', { get: () => 'MacIntel' });
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => (cmd === 'connection_profiles' ? [] : null),
      transformCallback: () => 0,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  // The specs navigate by URL hash, so the bundle must be built with the repo's config.json.
  const cfg = await page.request.get('/config.json').then((r) => r.json()).catch(() => ({}));
  if (!cfg.hashRouter || !cfg.hashRouter.enabled) {
    throw new Error(
      'config.json has hashRouter disabled: build with the repo config (cp ../config.json . && npm run build)'
    );
  }
  const hs = page.getByRole('textbox').first();
  await hs.fill(HS);
  await hs.press('Enter');
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('textbox').nth(1).fill(user);
  await page.locator('input[type=password]').fill(accounts[user]);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible({ timeout: 60000 });
  await dismissOnboarding(page);
  page.appErrors = () =>
    errors.filter((e) => !/fetch|network|net::|abort|load failed/i.test(e));
  return page;
}

module.exports = { findOverlaps, openApp, dismissOnboarding, accounts, HS };
