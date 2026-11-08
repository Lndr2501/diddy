// Standalone HTML inside the real allow-scripts-only sandbox; no app build or Matrix needed.
// Run: npx playwright test -c playwright.preview.config.cjs github-issues
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = fs.readFileSync(
  path.join(__dirname, '../../../docs/plugins/github-issues.html'),
  'utf8'
);

async function mount(page, { theme = 'dark', width = 420, layout = 'full' } = {}) {
  const errors = [];
  const queries = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setViewportSize({ width: width + 32, height: 800 });
  await page.route('https://plugin.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: plugin })
  );
  await page.route('https://api.github.com/**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query.get('q'));
    const currentPage = Number(query.get('page'));
    return route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        total_count: 23,
        incomplete_results: false,
        items: Array.from({ length: currentPage === 1 ? 20 : 3 }, (_, i) => ({
          number: (currentPage - 1) * 20 + i + 1,
          state: 'open',
          title:
            i === 0
              ? '<img src=x onerror=alert(1)> is only text'
              : `Improve issue ${i}: ${'a-long-title-'.repeat(8)}`,
          user: { login: 'octocat' },
          updated_at: '2026-11-08T12:00:00Z',
          comments: 2,
          labels: [{ name: 'enhancement' }, { name: 'platform: Linux' }],
        })),
      }),
    });
  });
  await page.route('https://diddy-host.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><body style="margin:16px;background:${
        theme === 'dark' ? '#10151b' : '#fff'
      }">
      <iframe title="GitHub Issues" sandbox="allow-scripts" style="width:${width}px;height:600px;border:0" src="https://plugin.test/github-issues.html"></iframe>
      <script>
        window.messages = []; window.saved = 'Lndr2501/diddy';
        window.init = {type:'diddy:init',apiVersion:1,theme:${JSON.stringify(
          theme
        )},layout:${JSON.stringify(layout)},locale:'de-DE'};
        const frame = document.querySelector('iframe');
        window.addEventListener('message', event => {
          if (event.source !== frame.contentWindow) return;
          const data = event.data; window.messages.push(data);
          if (data.type === 'diddy:ready') frame.contentWindow.postMessage(window.init, '*');
          if (data.type === 'diddy:resize') frame.style.height = Math.min(600, Math.max(80, data.height)) + 'px';
          if (data.type === 'diddy:storage:get') frame.contentWindow.postMessage({type:'diddy:storage:value',id:data.id,key:data.key,value:window.saved}, '*');
          if (data.type === 'diddy:storage:set') window.saved = data.value;
        });
      </script>`,
    })
  );
  await page.goto('https://diddy-host.test/');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#count')).toHaveText('23');
  return { frame, errors, queries };
}

for (const theme of ['dark', 'light']) {
  for (const width of [240, 420]) {
    test(`GitHub Issues: ${theme}, ${width}px, opaque sandbox, no overflow or HTML injection`, async ({
      page,
    }) => {
      const { frame, errors, queries } = await mount(page, { theme, width });
      await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(frame.locator('#issues li')).toHaveCount(20);
      await expect(frame.locator('#issues img')).toHaveCount(0);
      await expect(frame.locator('#issues a').first()).toContainText('<img src=x');
      expect(
        await frame
          .locator('html')
          .evaluate((element) => element.scrollWidth <= element.clientWidth)
      ).toBe(true);
      expect(
        await frame.locator('body').evaluate(() => {
          try {
            localStorage.getItem('test');
            return false;
          } catch (error) {
            return error.name === 'SecurityError';
          }
        })
      ).toBe(true);
      await frame.getByRole('button', { name: 'Nächste Seite' }).click();
      await expect(frame.locator('#issues li')).toHaveCount(3);
      await expect(frame.locator('#page')).toHaveText('2 / 2');
      await frame.locator('#issues a').first().click();
      await expect
        .poll(() =>
          page.evaluate(() => window.messages.filter((m) => m.type === 'diddy:open').at(-1)?.url)
        )
        .toBe('https://github.com/Lndr2501/diddy/issues/21');
      expect(queries.every((q) => q === 'repo:Lndr2501/diddy is:issue is:open')).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('changes repository, saves it through Diddy and supports live compact/theme changes', async ({
  page,
}) => {
  const { frame, errors } = await mount(page);
  await frame.getByRole('textbox').fill('https://github.com/octocat/Hello-World');
  await frame.getByRole('textbox').press('Enter');
  await expect(frame.locator('#repository-link')).toContainText('octocat/Hello-World');
  await expect.poll(() => page.evaluate(() => window.saved)).toBe('octocat/Hello-World');
  await page.evaluate(() => {
    document
      .querySelector('iframe')
      .contentWindow.postMessage(
        {
          ...window.init,
          theme: 'light',
          layout: 'compact',
          customCss: 'h1 { letter-spacing: 1px; }',
        },
        '*'
      );
  });
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(frame.locator('#issues')).toBeHidden();
  await expect(frame.locator('#count')).toBeVisible();
  await expect(frame.locator('h1')).toHaveCSS('letter-spacing', '1px');
  await expect.poll(() => page.locator('iframe').evaluate((el) => el.clientHeight)).toBe(80);
  expect(errors).toEqual([]);
});
