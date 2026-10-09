// The PWA offline specs as `npm test` runs them: against the test build npm test has just made
// in test-results/dist-test (the app built with VITE_CUBESIGHT_TEST_STUB=1, so the cube is the
// placeholder and never drawn in software WebGL: that alone was most of the suite's CPU).
// (Specs: pwa-tests/. Run by npm test against the built app.)
import path from 'node:path';
import { defineConfig } from 'playwright/test';
import base from '../playwright.pwa.config.js';

// One above the browser tests' port: `npm test` runs both at once.
const port = process.env.PW_PWA_PORT || (process.env.PW_PORT ? Number(process.env.PW_PORT) + 1 : 4175);
const root = process.cwd();

export default defineConfig({
  ...base,
  testDir: path.join(root, 'pwa-tests'),
  outputDir: path.join(root, 'test-results/pwa-gate'),
  globalTimeout: process.env.CUBESIGHT_DEADLINE_MS ? Math.max(1000, Number(process.env.CUBESIGHT_DEADLINE_MS) - Date.now()) : 0,
  use: {
    ...base.use,
    baseURL: `http://127.0.0.1:${port}`,
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'cubesight-motion', value: 'off' }] }] },
  },
  webServer: { command: `npx vite preview --outDir test-results/dist-test --host 127.0.0.1 --strictPort --port ${port}`, url: `http://127.0.0.1:${port}`, cwd: root, reuseExistingServer: false },
});
