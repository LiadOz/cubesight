import { defineConfig } from 'playwright/test';

// PW_PORT lets parallel worktrees run the suite without colliding on one port.
const port = process.env.PW_PORT || 4174;

// Tests never run the 3D cube: the dev server runs with VITE_CUBESIGHT_TEST_STUB=1, so every
// import of src/cube-3d.js resolves to the empty placeholder src/cube-placeholder.js (vite.config.js).
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  // tests/unported/: feature tests parked out of npm test until their checks move to unit
  // tests (docs/TESTS-TO-PORT.md). Run one by hand: PW_UNPORTED=1 npx playwright test tests/unported/<spec>.
  testIgnore: process.env.PW_UNPORTED ? ['**/layout/**'] : ['**/layout/**', '**/unported/**'],
  timeout: 20_000,
  retries: 0,
  outputDir: 'test-results/playwright',
  fullyParallel: true,
  workers: Number(process.env.PW_WORKERS || 4),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 900 },
    reducedMotion: process.env.PW_MOTION === 'reduce' ? 'reduce' : 'no-preference',
    // Animations off (src/ui/motion.js): tests never wait for one. A spec that tests motion
    // opts out with test.use({ storageState: { cookies: [], origins: [] } }).
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'cubesight-motion', value: 'off' }] }] },
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    env: { VITE_CUBESIGHT_TEST_STUB: '1' },
    // A gate must validate current modules, never a stale worktree server.
    reuseExistingServer: false,
  },
});
