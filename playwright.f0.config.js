import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'ui-foundation.spec.js',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4240', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run dev -- --port 4240', url: 'http://127.0.0.1:4240', reuseExistingServer: true },
});
