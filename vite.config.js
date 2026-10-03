import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';
import { galleryPlugin } from './scripts/gallery-index.mjs';
import fs from 'node:fs';
import { APP_NAME } from './src/copy/nav.js';

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

// Generated search experiments are research artifacts, never application data.
const researchBoundaryPlugin = {
  name: 'cubesight-research-boundary',
  apply: 'build',
  generateBundle() {
    for (const id of this.getModuleIds()) {
      if (/[/\\]docs[/\\]research[/\\]alg-gen[/\\]out[/\\]/.test(id)) {
        this.error(`Research output cannot ship in the app bundle: ${id}`);
      }
    }
  },
};

// The product name comes from src/copy/nav.js (one place to rename it).
const appNamePlugin = {
  name: 'cubesight-app-name',
  transformIndexHtml: { order: 'pre', handler: html => html.replaceAll('%APP_NAME%', APP_NAME) },
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

// Private lab preview shell: localStorage and IndexedDB are replaced by a
// per-iframe in-memory fixture before the real application module is imported.
const labPreviewPlugin = {
  name: 'cubesight-dev-lab-preview',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__lab-preview', (_request, response) => {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>CubeSight lab preview</title></head><body><script type="module" src="/src/dev/lab/preview-bootstrap.js"></script></body></html>');
    });
  },
};

const labFeedbackPlugin = {
  name: 'cubesight-dev-lab-feedback',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__lab-feedback', (request, response) => {
      if (request.method !== 'POST') { response.statusCode = 405; response.end('405'); return; }
      const chunks = [];
      let size = 0;
      request.on('data', chunk => { size += chunk.length; if (size > 2e6) request.destroy(); else chunks.push(chunk); });
      request.on('end', () => {
        try {
          const payload = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(payload);
          const dir = '/tmp/cubesight-lab';
          fs.mkdirSync(dir, { recursive: true });
          const file = `${dir}/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
          fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ file }));
        } catch (error) { response.statusCode = 400; response.end(String(error?.message || error)); }
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
    // Dev server only (apply: 'serve'): the image gallery's /__gallery listing. Never part of a build.
    galleryPlugin(),
    researchBoundaryPlugin,
    appNamePlugin,
    devLogPlugin,
    recordingPlugin,
    labPreviewPlugin,
    labFeedbackPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Solve with a smart cube, drill recognition, and track progress. Works offline.',
        // The home route (#/) picks solve or drills for the device.
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
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // cubing.js starts a module worker from its WCA random-state
          // scrambler. Keep package modules in a browser-safe chunk so the
          // worker entry does not import the app entry.
          if (id.includes('/node_modules/cubing/dist/lib/cubing/')) return 'cubing-core';
        },
      },
    },
  },
  // CUBESIGHT_NO_WATCH=1: dev mode without file watching. The page never changes
  // under you while agents edit code; restart the server to pick up changes.
  server: { hmr: false, host: true, allowedHost: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), fs.realpathSync('./node_modules')] }, watch: process.env.CUBESIGHT_NO_WATCH ? null : { ignored: [/[\\/]\.claude[\\/]/, /[\\/]test-results[\\/]/] } },
  // Only crawl the app's own entry for dependency pre-bundling; agent worktrees
  // under .claude/ contain their own index.html and build output.
  optimizeDeps: { entries: ['index.html'], exclude: ['cubing'] },
});
