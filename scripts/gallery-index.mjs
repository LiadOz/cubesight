// Dev-only image gallery index (served by the Vite dev server at /__gallery; never part of a build).
// Pure-ish helpers over the filesystem so they can be unit-tested against a temp directory
// (tests/gallery-index-unit.test.mjs). See gallery/README.md for the rules agents follow.
import fs from 'node:fs';
import path from 'node:path';

export const IMAGE_RE = /\.(png|jpe?g|webp|svg)$/i;
/** Image folders the gallery lists. Visual-test baselines are included so they can be covered by posts. */
export const ROOTS = Object.freeze([
  { dir: 'docs/design', kind: 'designs' },
  { dir: 'gallery', kind: 'screenshots' },
]);
const SKIP_DIRS = new Set(['node_modules', '.claude', 'dist', '_src', '.git', 'test-results', 'playwright-report']);

const toPosix = p => p.split(path.sep).join('/');
const urlFor = rel => '/' + rel.split('/').map(encodeURIComponent).join('/');
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

// ---------------------------------------------------------------- names and ids

/** 'A-05-results.png' -> 'A-05'; 'F1-03-x.png' -> 'F1-03'; '00-flow.svg' -> '00'; 'brain-idea-B.svg' -> ''. */
export function parseImageId(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '');
  const match = /^((?:[A-Za-z]+\d*-)?\d+[A-Za-z]?)(?=[-_ .]|$)/.exec(base);
  return match ? match[1] : '';
}

/** 'A-05-results-dark.png' -> 'results dark' (the ID prefix and extension dropped). */
export function titleFromFile(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '');
  const id = parseImageId(fileName);
  const rest = base.slice(id.length).replace(/^[-_ .]+/, '').replace(/[-_]+/g, ' ').trim();
  return rest || base;
}

const stripId = (caption, id) => {
  if (!id) return caption;
  const re = new RegExp('^' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[·:.\\-–—]?\\s*');
  return caption.replace(re, '').trim() || caption;
};

// ---------------------------------------------------------------- small cached file readers

const textCache = new Map(); // abs path -> { mtimeMs, value }
function cachedParse(file, parse) {
  let stat;
  try { stat = fs.statSync(file); } catch { return null; }
  const hit = textCache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.value;
  let value = null;
  try { value = parse(fs.readFileSync(file, 'utf8')); } catch { value = null; }
  textCache.set(file, { mtimeMs: stat.mtimeMs, value });
  return value;
}

const plainText = html => html.replace(/<[^>]*>/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** The bits of an existing static gallery page worth reusing: <title>, first paragraph, image captions. */
export function parseIndexHtml(html, dir) {
  const title = plainText((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  const meta = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html);
  const para = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const description = meta ? plainText(meta[1]) : para ? plainText(para[1]).slice(0, 240) : '';
  const captions = {};
  const resolve = src => {
    if (/^(?:[a-z]+:|\/\/|data:)/i.test(src)) return null;
    let clean = src.split(/[?#]/)[0];
    try { clean = decodeURI(clean); } catch { /* keep raw */ }
    return path.resolve(dir, clean);
  };
  for (const figure of html.match(/<figure\b[\s\S]*?<\/figure>/gi) || []) {
    const src = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(figure);
    const cap = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(figure);
    const abs = src && resolve(src[1]);
    if (abs && cap && plainText(cap[1])) captions[abs] = plainText(cap[1]);
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag);
    const alt = /\balt=["']([^"']+)["']/i.exec(tag);
    const abs = src && resolve(src[1]);
    if (abs && alt && !captions[abs]) captions[abs] = plainText(alt[1]);
  }
  return { title, description, captions };
}

const indexOfDir = dir => cachedParse(path.join(dir, 'index.html'), html => parseIndexHtml(html, dir));
const manifestOfDir = dir => cachedParse(path.join(dir, 'manifest.json'), text => JSON.parse(text));

/** Caption from the nearest gallery index.html at or above the image (stopping at the root dir). */
function captionFromIndex(abs, rootAbs) {
  let dir = path.dirname(abs);
  for (;;) {
    const index = indexOfDir(dir);
    if (index?.captions[abs]) return index.captions[abs];
    if (dir === rootAbs || dir === path.dirname(dir)) return '';
    dir = path.dirname(dir);
  }
}

// ---------------------------------------------------------------- images and groups

/** One image's listing entry. `manifest` is the folder manifest object (or null). */
export function describeImage(projectRoot, abs, rootAbs, manifest = null, stat = fs.statSync(abs)) {
  const name = path.basename(abs);
  const entry = manifest && typeof manifest[name] === 'object' && manifest[name] ? manifest[name] : {};
  const id = entry.id || parseImageId(name);
  const captionIdx = entry.title ? '' : captionFromIndex(abs, rootAbs);
  return {
    file: name,
    path: urlFor(toPosix(path.relative(projectRoot, abs))),
    size: stat.size,
    mtime: Math.round(stat.mtimeMs),
    id,
    title: entry.title || (captionIdx ? stripId(captionIdx, id) : titleFromFile(name)),
    caption: entry.caption || '',
  };
}

function orderImages(images, order) {
  const rank = new Map((Array.isArray(order) ? order : []).map((file, index) => [file, index]));
  return images.sort((a, b) => {
    const ra = rank.has(a.file) ? rank.get(a.file) : Infinity;
    const rb = rank.has(b.file) ? rank.get(b.file) : Infinity;
    return ra !== rb ? ra - rb : natural(a.file, b.file);
  });
}

/** Folders (under the roots) that directly hold images, as raw directory walks. */
function walkImageDirs(projectRoot, roots, visit) {
  const walk = (dirAbs, rootAbs, kind) => {
    let entries;
    try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }); } catch { return; }
    const files = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(path.join(dirAbs, entry.name), rootAbs, kind);
      } else if (entry.isFile() && IMAGE_RE.test(entry.name) && !entry.name.startsWith('.')) files.push(entry.name);
    }
    if (files.length) visit(dirAbs, rootAbs, kind, files);
  };
  for (const { dir, kind } of roots) {
    const rootAbs = path.join(projectRoot, dir);
    if (fs.existsSync(rootAbs)) walk(rootAbs, rootAbs, kind);
  }
}

/** Every folder under the roots that directly holds images, newest first. */
export function scanGroups(projectRoot, roots = ROOTS) {
  const groups = [];
  walkImageDirs(projectRoot, roots, (dirAbs, rootAbs, kind, files) => {
    const manifest = manifestOfDir(dirAbs);
    const index = indexOfDir(dirAbs);
    const rel = toPosix(path.relative(projectRoot, dirAbs));
    const images = [];
    for (const name of files) {
      try { images.push(describeImage(projectRoot, path.join(dirAbs, name), rootAbs, manifest)); } catch { /* vanished */ }
    }
    orderImages(images, manifest?.order);
    groups.push({
      path: rel,
      kind,
      title: (typeof manifest?.title === 'string' && manifest.title) || index?.title || (path.relative(rootAbs, dirAbs) ? path.relative(rootAbs, dirAbs).split(path.sep).join(' / ') : path.basename(dirAbs)),
      description: (typeof manifest?.description === 'string' && manifest.description) || index?.description || '',
      index: index ? urlFor(rel) + '/index.html' : null,
      count: images.length,
      mtime: images.reduce((latest, image) => Math.max(latest, image.mtime), 0),
      images,
    });
  });
  return groups.sort((a, b) => b.mtime - a.mtime || natural(a.path, b.path));
}

/** Project-relative posix paths of every gallery-listable image (for the coverage check). */
export function listAllImages(projectRoot, roots = [...ROOTS, { dir: 'tests', kind: 'tests' }]) {
  const out = [];
  walkImageDirs(projectRoot, roots, (dirAbs, _rootAbs, _kind, files) => {
    for (const name of files) out.push(toPosix(path.relative(projectRoot, path.join(dirAbs, name))));
  });
  return out.filter(rel => !rel.startsWith('tests/') || rel.includes('-snapshots/')).sort(natural);
}

// ---------------------------------------------------------------- posts (gallery/**/post.md)

const unquote = s => s.replace(/^(["'])(.*)\1$/, '$2');

function scalar(raw) {
  let value = raw.trim();
  if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, '').trim();
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean);
  }
  return unquote(value);
}

/** '---\nkey: value\n---\nbody': strings, inline [a, b] lists, '- item' block lists, # comments. */
export function parseFrontMatter(text) {
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    if (kv[2].trim() === '' || /^#/.test(kv[2].trim())) {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        i += 1;
        items.push(scalar(lines[i].replace(/^\s*-\s+/, '')));
      }
      data[kv[1]] = items.length ? items : '';
    } else data[kv[1]] = scalar(kv[2]);
  }
  return { data, body: text.slice(match[0].length) };
}

const asList = value => (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean);

/**
 * Images a post shows. `images:` entries are names relative to the post folder, or '/project/relative'
 * paths (so a post can cover docs/design files in place); a `*` in the file name is a glob over that
 * folder's images (`/docs/design/brain-v2/*`, `/docs/design/brain-v2/C-dark-*`). Own-folder images follow.
 */
function postImagePaths(projectRoot, dirAbs, listed) {
  const out = [];
  const ownImages = dir => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile() && IMAGE_RE.test(e.name) && !e.name.startsWith('.')).map(e => e.name).sort(natural)
        .map(name => path.join(dir, name));
    } catch { return []; }
  };
  for (const raw of listed) {
    const abs = raw.startsWith('/') ? path.join(projectRoot, raw) : path.join(dirAbs, raw);
    const base = path.basename(abs);
    if (base.includes('*')) {
      const pattern = new RegExp('^' + base.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      out.push(...ownImages(path.dirname(abs)).filter(file => pattern.test(path.basename(file))));
    } else out.push(abs);
  }
  out.push(...ownImages(dirAbs));
  return out;
}

/** Every post.md under gallery/, newest first. Returns { posts, warnings }. */
export function scanPosts(projectRoot, galleryDir = 'gallery') {
  const posts = [];
  const warnings = [];
  const rootAbs = path.join(projectRoot, galleryDir);
  const walk = dirAbs => {
    let entries;
    try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(path.join(dirAbs, entry.name));
    }
    if (!entries.some(entry => entry.isFile() && entry.name === 'post.md')) return;
    const file = path.join(dirAbs, 'post.md');
    const parsed = cachedParse(file, parseFrontMatter);
    if (!parsed) return;
    const rel = toPosix(path.relative(projectRoot, dirAbs));
    const slug = path.basename(dirAbs);
    const dated = /^(\d{4}-\d{2}-\d{2})/.exec(slug);
    const { data } = parsed;
    const manifest = manifestOfDir(dirAbs);
    const resolved = [];
    const seen = new Set();
    for (const abs of postImagePaths(projectRoot, dirAbs, asList(data.images))) {
      if (seen.has(abs) || !IMAGE_RE.test(abs)) continue;
      let stat;
      try { stat = fs.statSync(abs); } catch { warnings.push(`${rel}/post.md: missing image ${toPosix(path.relative(projectRoot, abs))}`); continue; }
      seen.add(abs);
      resolved.push(describeImage(projectRoot, abs, rootAbs, manifest, stat));
    }
    const postMtime = Math.round(fs.statSync(file).mtimeMs);
    posts.push({
      id: String(data.id || slug),
      title: String(data.title || slug),
      date: String(data.date || (dated ? dated[1] : new Date(postMtime).toISOString().slice(0, 10))),
      branch: String(data.branch || 'main'),
      parent: asList(data.parent),
      status: String(data.status || 'exploring'),
      author: String(data.author || ''),
      decision: String(data.decision || ''),
      body: parsed.body,
      path: rel,
      base: urlFor(rel) + '/',
      images: resolved,
      mtime: resolved.reduce((latest, image) => Math.max(latest, image.mtime), postMtime),
    });
  };
  if (fs.existsSync(rootAbs)) walk(rootAbs);
  const ids = new Set();
  for (const post of posts) {
    if (ids.has(post.id)) warnings.push(`duplicate post id "${post.id}" (${post.path})`);
    ids.add(post.id);
  }
  for (const post of posts) {
    for (const parent of post.parent) if (!ids.has(parent)) warnings.push(`post "${post.id}": unknown parent "${parent}"`);
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime || natural(a.id, b.id));
  return { posts, warnings };
}

/** Images (project-relative posix paths) under docs/design, gallery and tests that no post shows. */
export function findUncoveredImages(projectRoot) {
  const { posts } = scanPosts(projectRoot);
  const covered = new Set();
  for (const post of posts) for (const image of post.images) covered.add(decodeURIComponent(image.path).slice(1));
  return { posts: posts.length, covered: covered.size, uncovered: listAllImages(projectRoot).filter(rel => !covered.has(rel)) };
}

// ---------------------------------------------------------------- the /__gallery payload

let memo = { at: 0, root: '', value: null };

/** { generatedAt, groups, posts, warnings }; a burst of requests within 750 ms shares one scan. */
export function buildGalleryIndex(projectRoot, { now = Date.now(), ttlMs = 750 } = {}) {
  if (memo.value && memo.root === projectRoot && now - memo.at < ttlMs) return memo.value;
  const { posts, warnings } = scanPosts(projectRoot);
  const value = { generatedAt: now, groups: scanGroups(projectRoot), posts, warnings };
  memo = { at: now, root: projectRoot, value };
  return value;
}

/** Vite plugin: dev server only (configureServer never runs in `vite build`). */
export function galleryPlugin() {
  return {
    name: 'cubesight-dev-gallery',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__gallery', (request, response, next) => {
        if (request.method !== 'GET') { next(); return; }
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(buildGalleryIndex(server.config.root)));
      });
    },
  };
}
