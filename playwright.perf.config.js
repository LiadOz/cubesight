import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './perf',
  testMatch: '**/*.spec.js',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  outputDir: 'test-results/perf/playwright',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 5_000,
    serviceWorkers: 'allow',
    launchOptions: { args: ['--enable-precise-memory-info', '--use-gl=angle', '--use-angle=swiftshader'] },
  },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4176',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4177',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
