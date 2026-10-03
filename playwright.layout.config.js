import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/layout',
  testMatch: '**/*.spec.js',
  timeout: 20_000,
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4248',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'npm run dev -- --port 4248',
    url: 'http://127.0.0.1:4248',
    reuseExistingServer: true,
  },
});
