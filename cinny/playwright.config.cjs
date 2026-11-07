const { defineConfig } = require('@playwright/test');

// Serves the production bundle from cinny/dist (build it first: cp config.json .. && npm run build).
module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    port: 4173,
    timeout: 60000,
  },
});
