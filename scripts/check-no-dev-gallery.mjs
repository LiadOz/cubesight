// Run after `vite build`: the dev-only image gallery must leave no trace in dist/ (no /__gallery
// endpoint, no gallery page code or styles, no lightbox, no gallery route).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const MARKERS = ['__gallery', '/dev/gallery', 'gallery-view', 'g-timeline', 'dev gallery', '__lightbox', 'lb-root'];

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(?:js|css|html|json|webmanifest|map)$/.test(entry.name)) yield full;
  }
}

if (!fs.existsSync(dist)) { console.error('dist/ is missing: run `npm run build` first'); process.exit(1); }
const found = [];
for (const file of files(dist)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of MARKERS) if (text.includes(marker)) found.push(`${path.relative(dist, file)}: ${marker}`);
}
if (fs.existsSync(path.join(dist, 'gallery')) || fs.existsSync(path.join(dist, 'docs'))) found.push('dist contains gallery/ or docs/ images');
if (found.length) { console.error('dev-only gallery leaked into the production build:\n  ' + found.join('\n  ')); process.exit(1); }
console.log('production build has no dev gallery (checked', MARKERS.length, 'markers)');
