import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/layout',
  testMatch: '**/*.spec.js',
  outputDir: 'test-results/layout-playwright',
  timeout: 20_000,
  globalSetup: './tests/layout/global-setup.js',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${process.env.PW_PORT || 4248}`,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `npm run dev -- --port ${process.env.PW_PORT || 4248}`,
    url: `http://127.0.0.1:${process.env.PW_PORT || 4248}`,
    reuseExistingServer: false,
  },
});
