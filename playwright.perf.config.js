import { defineConfig } from 'playwright/test';
import { gpuLaunchOptions } from './scripts/browser-gpu.mjs';

const gpuMode = process.env.CUBESIGHT_PERF_GPU === '1';
const gpuLaunch = gpuMode ? gpuLaunchOptions() : null;
const previewPort = Number(process.env.PW_PORT || 4176);
const fixturePort = previewPort + 1;

export default defineConfig({
  testDir: './perf',
  testMatch: '**/*.spec.js',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  outputDir: 'test-results/perf/playwright',
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    ...(gpuMode ? { channel: gpuLaunch.channel, headless: gpuLaunch.headless } : {}),
    viewport: { width: 1280, height: 900 },
    actionTimeout: 5_000,
    serviceWorkers: 'allow',
    launchOptions: { ...(gpuLaunch || {}), args: ['--enable-precise-memory-info', ...(gpuMode ? gpuLaunch.args : ['--use-gl=angle', '--use-angle=swiftshader'])] },
  },
  webServer: [
    {
      command: `npm run build && npm run preview -- --host 127.0.0.1 --strictPort --port ${previewPort}`,
      url: `http://127.0.0.1:${previewPort}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --strictPort --port ${fixturePort}`,
      url: `http://127.0.0.1:${fixturePort}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
