import { defineConfig } from 'playwright/test';

// Used only by `npm run design:diff` (scripts/design-diff.mjs). Port comes from DESIGN_DIFF_PORT (default 5191).
const port = Number(process.env.DESIGN_DIFF_PORT || 5191);
export default defineConfig({
  testDir: './scripts/design-diff',
  testMatch: '**/capture.spec.js',
  outputDir: process.env.DESIGN_DIFF_RESULTS || 'test-results/design-diff',
  timeout: 90_000,
  workers: 3,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `CUBESIGHT_NO_WATCH=1 npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
