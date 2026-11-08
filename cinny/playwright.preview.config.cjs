const { defineConfig } = require('@playwright/test');

// Theme checks on the real call tiles (no Matrix server, no call needed): the tiles are rendered
// by the Vite dev server from preview/agent-tile.html with fake people.  Run: npm run test:tiles
module.exports = defineConfig({
  testDir: './tests/preview',
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/preview',
  use: { baseURL: 'http://127.0.0.1:5199', headless: true, viewport: { width: 1280, height: 720 } },
  webServer: {
    command: 'npx vite --config preview/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort',
    port: 5199,
    timeout: 90000,
    reuseExistingServer: true,
  },
});
