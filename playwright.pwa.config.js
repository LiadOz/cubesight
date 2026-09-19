import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './pwa-tests',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  },
});
