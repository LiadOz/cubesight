import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 20_000,
  // These tests share software-rendered WebGL; excessive concurrency can
  // starve short visual feedback assertions and browser animation frames.
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
  },
});
