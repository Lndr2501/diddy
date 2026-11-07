const { defineConfig, devices } = require('@playwright/test');

// README preview images (not part of the test suite). Same setup as the macOS UI tests:
// built bundle (repo config.json!), WebKit, local Synapse test server.
// Run on the Mac:  npm run shots   -> writes ../docs/screenshots/*.png
module.exports = defineConfig({
  testDir: './tests/screenshots',
  fullyParallel: false,
  workers: 1,
  timeout: 300000,
  reporter: [['list']],
  outputDir: 'test-results/shots',
  use: { baseURL: 'http://127.0.0.1:4175', ...devices['Desktop Safari'], headless: true },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4175 --strictPort',
    port: 4175,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
