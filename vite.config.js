import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

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

// Dev-only diagnostics sink: trainers POST connection logs / errors here so the agent
// can read them from the container while debugging. This is NOT part of the
// production build — configureServer only runs in `vite` (dev), never in
// preview/`vite build`, so nothing is collected on a deployed site.
const devLogPlugin = {
  name: 'cubesight-dev-log',
  configureServer(server) {
    server.middlewares.use('/__devlog', (request, response) => {
      if (request.method !== 'POST') { response.statusCode = 405; response.end('405'); return; }
      let body = '';
      request.on('data', chunk => { body += chunk; if (body.length > 1e6) request.destroy(); });
      request.on('end', () => {
        try {
          fs.appendFileSync('/tmp/cubesight-devlog.jsonl', body.replace(/\n/g, ' ') + '\n');
        } catch { /* ignore */ }
        response.end('ok');
      });
    });
  },
};

// Dev-only recording sink: the Brain's "Save recording" POSTs the always-on
// input recording here; replay it with `node scripts/replay-recording.mjs`.
const recordingPlugin = {
  name: 'cubesight-dev-recording',
  configureServer(server) {
    server.middlewares.use('/__recording', (request, response) => {
      if (request.method !== 'POST') { response.statusCode = 405; response.end('405'); return; }
      const chunks = [];
      let size = 0;
      request.on('data', chunk => { size += chunk.length; if (size > 200e6) request.destroy(); else chunks.push(chunk); });
      request.on('end', () => {
        try {
          const dir = '/tmp/cubesight-recordings';
          fs.mkdirSync(dir, { recursive: true });
          const file = `${dir}/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          fs.writeFileSync(file, Buffer.concat(chunks));
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ file }));
        } catch (error) { response.statusCode = 500; response.end(String(error?.message || error)); }
      });
    });
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
    devLogPlugin,
    recordingPlugin,
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
  server: { hmr: false, host: true, allowedHost: true },
  optimizeDeps: { exclude: ['cubing'] },
});
