import { defineConfig } from 'playwright/test';
import config from './playwright.config.js';

// Stable critical-path smoke. Additional affected specs are supplied by the
// caller; the queue keeps its full gates until this tier is proven green.
export default defineConfig({
  ...config,
  testMatch: '**/*.spec.js',
  outputDir: 'test-results/merge-smoke',
  use: { ...config.use, reducedMotion: 'reduce' },
});
