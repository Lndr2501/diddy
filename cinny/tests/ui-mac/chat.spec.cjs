// Two-account chat flow in the macOS UI (WebKit): testa sends, testb accepts the invite and sees it.
// Room + invite are created through the Matrix API (fast, robust); sending/receiving goes through the UI.
// Needs the local Synapse test server and accounts file, see loggedin.spec.cjs.
const { test, expect } = require('@playwright/test');
const { openApp, accounts, HS } = require('./helpers.cjs');

test.skip(!accounts.testa || !accounts.testb, "need testa and testb accounts (DIDDY_TEST_ACCOUNTS)");

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

/** Opens a room by id. The room list is alphabetical and virtualized (a new "ui-test-..." room is
 * usually outside the rendered rows), so navigate by hash. Navigation right after login can be
 * ignored while the first sync runs, and re-setting the same hash fires no event: so every retry
 * first goes to #/home/ and then to the room. */
async function openRoomById(page, roomId, roomName, expectText = roomName) {
  await expect(async () => {
    await page.evaluate(async (id) => {
      window.location.hash = '#/home/';
      await new Promise((r) => setTimeout(r, 300));
      window.location.hash = `#/home/${id}/`;
    }, roomId);
    await expect(page.getByText(expectText).first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 40000, intervals: [500, 1000, 2000] });
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
  await openRoomById(a, roomId, roomName);
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
  await openRoomById(b, roomId, roomName, text);
  await b.screenshot({ path: 'test-results/ui-mac/screens/chat-testb.png' });
});
