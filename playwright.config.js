import { defineConfig } from 'playwright/test';

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
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 4174',
    url: 'http://127.0.0.1:4174',
    // A gate must validate current modules, never a stale worktree server.
    reuseExistingServer: false,
  },
});
