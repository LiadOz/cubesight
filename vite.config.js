import { defineConfig } from 'vite';

// Training sessions should only restart when the learner chooses to refresh.
export default defineConfig({ server: { hmr: false } });
