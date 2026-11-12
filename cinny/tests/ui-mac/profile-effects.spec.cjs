// Profile effects and frames (dev features): cards in the profile editor, ZIP import and what a
// second account sees. Skips itself on builds without these cards. Optional ZIP fixtures:
//   DIDDY_TEST_ZIPS=<dir> with effect.zip (Phasen/ or Ebenen/) and frame.zip (Ebenen/ with top/bottom).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openApp, accounts, HS } = require('./helpers.cjs');

test.skip(!accounts.testa || !accounts.testb, 'needs test accounts testa and testb');

const ZIPS = process.env.DIDDY_TEST_ZIPS || path.join(os.homedir(), 'diddy-testserver', 'zips');
const zip = (name) => path.join(ZIPS, name);

const api = async (method, p, token, body) =>
  (
    await fetch(`${HS}/_matrix/client/v3${p}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    })
  ).json();
const login = async (user) =>
  (
    await fetch(`${HS}/_matrix/client/v3/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user },
        password: accounts[user],
      }),
    })
  ).json();

const openProfile = async (page) => {
  await page.getByRole('button', { name: 'User settings' }).click();
  await page.getByRole('navigation', { name: 'Settings' }).getByText('Profile', { exact: true }).click();
  const setup = page.getByRole('button', { name: 'Create Diddy Options room' });
  if (await setup.isVisible({ timeout: 4000 }).catch(() => false)) await setup.click();
  await expect(page.getByRole('tab', { name: 'Identity' })).toBeVisible({ timeout: 30000 });
  const effects = page.getByRole('group', { name: 'Profile effect presets' });
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click().catch(() => undefined);
    if (await effects.isVisible().catch(() => false)) return true;
  }
  return false;
};

test('profile editor: built-in effects and frames can be picked', async ({ browser }) => {
  test.setTimeout(120000);
  const page = await openApp(browser, 'testa', { width: 1300, height: 900 });
  const has = await openProfile(page);
  test.skip(!has, 'this build has no profile effect card');
  const effects = page.getByRole('group', { name: 'Profile effect presets' }).getByRole('button');
  const frames = page.getByRole('group', { name: 'Profile frame presets' }).getByRole('button');
  expect(await effects.count()).toBeGreaterThan(1);
  expect(await frames.count()).toBeGreaterThan(1);
  for (let i = 1; i < (await effects.count()); i += 1) {
    await effects.nth(i).click();
    await expect(effects.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
  for (let i = 1; i < (await frames.count()); i += 1) {
    await frames.nth(i).click();
    await expect(frames.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
  expect(page.appErrors()).toEqual([]);
});

test('frame ZIP imports; a second account sees effect and frame, the viewer switch hides the frame', async ({
  browser,
}) => {
  test.skip(!fs.existsSync(zip('frame.zip')), `no ${zip('frame.zip')}`);
  test.setTimeout(300000);
  const a = await openApp(browser, 'testa', { width: 1300, height: 900 });
  const has = await openProfile(a);
  test.skip(!has, 'this build has no profile effect card');
  await a.getByRole('group', { name: 'Profile effect presets' }).getByRole('button').nth(1).click();
  await a.locator('input[type=file][accept*=zip]').nth(2).setInputFiles(zip('frame.zip'));
  await expect(a.getByText(/\(\d+ layers?\)/).first()).toBeVisible({ timeout: 20000 });
  await a.getByRole('button', { name: 'Save changes' }).first().click();
  await a.waitForTimeout(3000);
  await expect(a.getByText(/could not save/i)).toHaveCount(0);

  // The profile data lives in testa's Diddy Options room: put it into a space both accounts share.
  const A = await login('testa');
  const B = await login('testb');
  const rooms = (await api('GET', '/joined_rooms', A.access_token)).joined_rooms;
  let options;
  for (const id of rooms) {
    const n = (await api('GET', `/rooms/${encodeURIComponent(id)}/state/m.room.name`, A.access_token)).name;
    if (n === 'Diddy Options') options = id;
  }
  expect(options).toBeTruthy();
  const space = (
    await api('POST', '/createRoom', A.access_token, {
      name: `Diddy Test Space ${Date.now()}`,
      creation_content: { type: 'm.space' },
      preset: 'private_chat',
      invite: [B.user_id],
    })
  ).room_id;
  await api('POST', `/join/${encodeURIComponent(space)}`, B.access_token, {});
  await api('PUT', `/rooms/${encodeURIComponent(space)}/state/m.space.child/${encodeURIComponent(options)}`, A.access_token, { via: ['localhost'] });
  await api('PUT', `/rooms/${encodeURIComponent(options)}/state/m.room.join_rules`, A.access_token, {
    join_rule: 'restricted',
    allow: [{ type: 'm.room_membership', room_id: space }],
  });
  // a room both share
  const shared = (
    await api('POST', '/createRoom', A.access_token, { name: `ui-test-${Date.now()}`, preset: 'private_chat', invite: [B.user_id] })
  ).room_id;
  await api('POST', `/join/${encodeURIComponent(shared)}`, B.access_token, {});

  const b = await openApp(browser, 'testb', { width: 1300, height: 900 });
  await expect
    .poll(async () => (await api('GET', '/joined_rooms', B.access_token)).joined_rooms.includes(options), {
      timeout: 60000,
    })
    .toBe(true);
  await b.evaluate((id) => {
    window.location.hash = `#/home/${id}/`;
  }, shared);
  await b.waitForTimeout(3000);
  await b.getByText('testa', { exact: true }).last().click({ timeout: 15000 });
  await b.waitForTimeout(3000);
  fs.mkdirSync('test-results/ui-mac/screens', { recursive: true });
  await b.screenshot({ path: 'test-results/ui-mac/screens/viewer-popout.png' });
  const frameImgs = () =>
    b.locator('img[src^="blob:"], img[src*="_matrix/media"], img[src*="_matrix/client/v1/media"]').count();
  const withFrame = await frameImgs();

  await b.keyboard.press('Escape');
  await b.getByRole('button', { name: 'User settings' }).click();
  await b.getByRole('navigation', { name: 'Settings' }).getByText('Appearance', { exact: true }).click();
  const sw = b
    .locator('xpath=//*[normalize-space(text())="Profile frames"]/ancestor::*[.//*[@role="switch" or self::input[@type="checkbox"]]][1]')
    .locator('[role=switch], input[type=checkbox]')
    .first();
  await sw.click({ timeout: 15000 });
  await b.keyboard.press('Escape');
  await b.waitForTimeout(500);
  await b.getByText('testa', { exact: true }).last().click({ timeout: 15000 });
  await b.waitForTimeout(2500);
  await b.screenshot({ path: 'test-results/ui-mac/screens/viewer-popout-frames-off.png' });
  expect(await frameImgs()).toBeLessThan(withFrame);
  expect(b.appErrors()).toEqual([]);
});
