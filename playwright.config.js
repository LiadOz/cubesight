import { defineConfig } from 'playwright/test';

// PW_PORT lets parallel worktrees run the suite without colliding on one port.
const port = process.env.PW_PORT || 4174;

// The tests do not test the cube's pixels, and headless Chromium draws WebGL in software
// (SwiftShader, on the CPU): four concurrent real-GL pages took a 20-core machine to load 38.
// So the dev server runs with VITE_CUBESIGHT_TEST_STUB=1, where the cube keeps all its logic,
// animation and data attributes but never touches WebGL (src/cube-3d.js; dev server only, never
// in a production build). That is what lets the suite run wide.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  // Dedicated Tier 2 commands own these suites; do not execute them twice.
  testIgnore: ['**/layout/**', '**/snapshots/**'],
  timeout: 20_000,
  retries: 0,
  outputDir: 'test-results/playwright',
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS || 8),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    reducedMotion: process.env.PW_MOTION === 'reduce' ? 'reduce' : 'no-preference',
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    // PW_REAL_GL=1 turns the no-render mode off for the whole run (real WebGL, slow, serial-only).
    env: process.env.PW_REAL_GL ? {} : { VITE_CUBESIGHT_TEST_STUB: '1' },
    // A gate must validate current modules, never a stale worktree server.
    reuseExistingServer: false,
  },
});
