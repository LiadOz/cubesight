import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';

function currentRevision() {
  if (process.env.CUBESIGHT_REF) return process.env.CUBESIGHT_REF;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'development'; }
}

const revision = currentRevision();
const buildInfo = JSON.stringify({ revision });
const buildInfoPlugin = {
  name: 'cubesight-build-info',
  configureServer(server) {
    server.middlewares.use('/version.json', (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(buildInfo);
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: buildInfo });
  },
};

// Installed apps have no update prompt UI, so activate new app shells
// immediately instead of leaving a stale worker waiting indefinitely.
export default defineConfig({
  define: {
    __CUBESIGHT_REVISION__: JSON.stringify(revision),
  },
  plugins: [
    buildInfoPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'CubeSight — Recognition Training',
        short_name: 'CubeSight',
        description: 'Offline Rubik\'s Cube recognition, F2L, PLL, and cross-planning practice.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f5f7fa',
        theme_color: '#087f75',
        categories: ['education', 'games'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,webmanifest,ico,png,svg,wasm,woff,woff2,txt}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: { hmr: false },
});
