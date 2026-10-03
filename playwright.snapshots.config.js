import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/snapshots/**/*.spec.js',
  outputDir: 'test-results/snapshots',
  timeout: 60_000,
  fullyParallel: true,
  workers: 2,
  snapshotPathTemplate: '{testDir}/snapshots/__baselines__/{testFileBaseName}/{arg}{ext}',
  expect: {
    timeout: 5000,
    toMatchAriaSnapshot: { children: 'equal' },
    toHaveScreenshot: { maxDiffPixelRatio: 0.001, threshold: 0.1 },
  },
  use: {
    baseURL: 'http://127.0.0.1:4250',
    viewport: { width: 1280, height: 720 },
    timezoneId: 'UTC',
    serviceWorkers: 'block',
    launchOptions: {
      args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 4250',
    url: 'http://127.0.0.1:4250',
    ...(process.env.CUBESIGHT_SNAPSHOT_APP_ROOT ? { cwd: process.env.CUBESIGHT_SNAPSHOT_APP_ROOT } : {}),
    reuseExistingServer: false,
  },
});
