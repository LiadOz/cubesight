import { defineConfig } from 'playwright/test';

// PW_PORT lets parallel worktrees run the suite without colliding on one port.
const port = process.env.PW_PORT || 4175;

export default defineConfig({
  testDir: './pwa-tests',
  timeout: 30_000,
  retries: 0,
  outputDir: 'test-results/pwa',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
