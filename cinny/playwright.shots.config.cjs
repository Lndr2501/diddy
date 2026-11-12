const { defineConfig, devices } = require('@playwright/test');

// README preview images (not part of the test suite). Built bundle (repo config.json!) and a
// local Synapse test server. WebKit by default (what the macOS app renders with); set
// DIDDY_SHOTS_CHROME=/path/to/chrome to use an installed Chrome instead (works on Linux).
// Run:  npm run shots   -> writes ../docs/screenshots/*.png
const chrome = process.env.DIDDY_SHOTS_CHROME;

module.exports = defineConfig({
  testDir: './tests/screenshots',
  testMatch: '*.spec.cjs',
  fullyParallel: false,
  workers: 1,
  timeout: 1800000,
  reporter: [['list']],
  outputDir: 'test-results/shots',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    ...(chrome
      ? {
          ...devices['Desktop Chrome'],
          // containers often have a tiny /dev/shm; Chrome then crashes while taking the screenshot
          launchOptions: { executablePath: chrome, args: ['--disable-dev-shm-usage'] },
        }
      : devices['Desktop Safari']),
    headless: true,
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4175 --strictPort',
    port: 4175,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
