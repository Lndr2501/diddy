// Two-account chat flow in the macOS UI (WebKit): testa sends, testb accepts the invite and sees it.
// Room + invite are created through the Matrix API (fast, robust); sending/receiving goes through the UI.
// Needs the local Synapse test server and accounts file, see loggedin.spec.cjs.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HS = process.env.DIDDY_TEST_HOMESERVER || 'http://127.0.0.1:8008';
const file =
  process.env.DIDDY_TEST_ACCOUNTS || path.join(os.homedir(), 'diddy-testserver', 'accounts.txt');
const accounts = {};
try {
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((l) => {
      const [u, p] = l.trim().split(/\s+/);
      if (u && p) accounts[u] = p;
    });
} catch (e) {
  /* skipped below */
}
test.skip(!accounts.testa || !accounts.testb, `need testa and testb in ${file}`);

const api = async (method, url, token, body) => {
  // Synapse rate-limits bursts (429 + retry_after_ms): wait and retry instead of failing.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(`${HS}/_matrix/client/v3${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = (await res.json().catch(() => ({}))).retry_after_ms || 1000;
      await new Promise((r) => setTimeout(r, wait + 200));
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error(`${method} ${url}: still rate limited after retries`);
};
const apiLogin = async (user) =>
  (
    await api('POST', '/login', null, {
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user },
      password: accounts[user],
    })
  ).access_token;

async function openApp(browser, user) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 750 } });
  await context.addInitScript(() => {
    Object.defineProperty(window.navigator, 'platform', { get: () => 'MacIntel' });
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => (cmd === 'connection_profiles' ? [] : null),
      transformCallback: () => 0,
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    };
  });
  const page = await context.newPage();
  await page.goto('/');
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
  // Onboarding dialogs (English "Skip", German "Überspringen") may appear one after another.
  const skip = page.getByRole('button', { name: /^(Skip|Überspringen)$/ });
  for (let i = 0; i < 6; i += 1) {
    if (!(await skip.first().isVisible({ timeout: 2500 }).catch(() => false))) break;
    // A dialog may be swapped for the next one mid-click: short timeout, then look again.
    await skip.first().click({ timeout: 3000 }).catch(() => undefined);
  }
  return page;
}

test('testa messages testb in a fresh room', async ({ browser }) => {
  test.setTimeout(90000);
  const roomName = `ui-test-${Date.now()}`;
  const text = `hello from testa ${Date.now()}`;
  const tokenA = await apiLogin('testa');
  const { room_id: roomId } = await api('POST', '/createRoom', tokenA, {
    name: roomName,
    preset: 'private_chat',
    invite: ['@testb:localhost'],
  });

  const a = await openApp(browser, 'testa');
  // Open by id: the room list is virtualized and grows with every test run.
  await a.evaluate((id) => { window.location.hash = `#/home/${id}/`; }, roomId);
  await expect(a.getByText(roomName).first()).toBeVisible({ timeout: 30000 });
  const composer = a.getByRole('textbox').last();
  await composer.click();
  await composer.pressSequentially(text);
  await composer.press('Enter');
  await expect(a.getByText(text).first()).toBeVisible({ timeout: 20000 });
  await a.screenshot({ path: 'test-results/ui-mac/screens/chat-testa.png' });

  const b = await openApp(browser, 'testb');
  await b.evaluate(() => { window.location.hash = '#/inbox/invites/'; });
  // Invites from people you already share rooms with show under "Primary", others under "Public".
  if (!(await b.getByText(roomName).first().isVisible({ timeout: 6000 }).catch(() => false))) {
    await b.getByText('Public').first().click();
  }
  await b.screenshot({ path: 'test-results/ui-mac/screens/invite-testb.png' });
  await expect(b.getByText(roomName).first()).toBeVisible({ timeout: 30000 });
  await b
    .locator('div')
    .filter({ hasText: roomName })
    .filter({ has: b.getByRole('button', { name: /accept/i }) })
    .last()
    .getByRole('button', { name: /accept/i })
    .click();
  await b.evaluate((id) => { window.location.hash = `#/home/${id}/`; }, roomId);
  await expect(b.getByText(text).first()).toBeVisible({ timeout: 30000 });
  await b.screenshot({ path: 'test-results/ui-mac/screens/chat-testb.png' });
});
