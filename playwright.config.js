import { defineConfig } from 'playwright/test';

// PW_PORT lets parallel worktrees run the suite without colliding on one port.
const port = process.env.PW_PORT || 4174;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  // Dedicated Tier 2 commands own these suites; do not execute them twice.
  testIgnore: ['**/layout/**', '**/snapshots/**'],
  timeout: 20_000,
  retries: 0,
  outputDir: 'test-results/playwright',
  // These tests share software-rendered WebGL; excessive concurrency can
  // starve short visual feedback assertions and browser animation frames.
  // Raising workers/fullyParallel was measured (72s -> 49s on a subset) but broke 26
  // tests in the full suite: software WebGL contends. F11 must fix the contention
  // (shared browser, stubbed cube) before raising this.
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    // A gate must validate current modules, never a stale worktree server.
    reuseExistingServer: false,
  },
});
