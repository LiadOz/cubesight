// The PWA offline specs as `npm test` runs them: against the build the gate has just made.
// playwright.pwa.config.js builds again before it serves; inside the gate that would race the
// gate's own build over dist/, so this wraps it and serves the existing dist/ instead.
// (Specs: pwa-tests/. Run by npm test against the built app.)
import path from 'node:path';
import { defineConfig } from 'playwright/test';
import base from '../playwright.pwa.config.js';

const port = process.env.PW_PWA_PORT || process.env.PW_PORT || 4175;
const root = process.cwd();

export default defineConfig({
  ...base,
  testDir: path.join(root, 'pwa-tests'),
  outputDir: path.join(root, 'test-results/pwa-gate'),
  globalTimeout: process.env.CUBESIGHT_DEADLINE_MS ? Math.max(1000, Number(process.env.CUBESIGHT_DEADLINE_MS) - Date.now()) : 0,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: { command: `npm run preview -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
});
