import { defineConfig, mergeConfig } from 'vite';
import { realpathSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import base from './vite.config.js';

const root = fileURLToPath(new URL('.', import.meta.url));
export default mergeConfig(base, defineConfig({
  server: {
    fs: {
      allow: [root, realpathSync(new URL('./node_modules', import.meta.url))],
    },
  },
}));
