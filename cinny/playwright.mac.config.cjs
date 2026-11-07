const { defineConfig, devices } = require('@playwright/test');

// Local UI tests for the macOS app. Tauri renders the UI in WKWebView, so these run the built web
// bundle in Playwright's WebKit engine with macOS platform + a mocked Tauri bridge.
// Build first:  cp ../config.json . && npm run build     Run:  npm run test:ui:mac
module.exports = defineConfig({
  testDir: './tests/ui-mac',
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/ui-mac-report' }]],
  outputDir: 'test-results/ui-mac',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    ...devices['Desktop Safari'],
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4174 --strictPort',
    port: 4174,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
