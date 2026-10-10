// Dev-only federation of gallery posts. No copying or writes to another checkout.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildGalleryIndex, scanGroups, scanPosts } from './gallery-index.mjs';

const tokenFor = root => createHash('sha256').update(root).digest('hex').slice(0, 16);
const prefixFor = root => `/__gallery-assets/${tokenFor(root)}`;

/** Git is the source of truth; scratch merge-queue checkouts are never publications. */
export function galleryWorktrees(projectRoot) {
  let output;
  try { output = execFileSync('git', ['-C', projectRoot, 'worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8', timeout: 3000 }); }
  catch { return [projectRoot]; }
  const roots = output.split('\0').filter(field => field.startsWith('worktree ')).map(field => field.slice(9))
    .filter(root => !root.split(path.sep).includes('merge-queue') && fs.existsSync(root));
  return [...new Set([path.resolve(projectRoot), ...roots])];
}

let memo = { key: '', at: 0, value: null };

export function buildWorktreeGalleryIndex(projectRoot, { worktrees = galleryWorktrees(projectRoot), now = Date.now(), ttlMs = 750 } = {}) {
  const roots = [...new Set([path.resolve(projectRoot), ...worktrees.map(root => path.resolve(root))])];
  const key = JSON.stringify(roots);
  if (memo.value && memo.key === key && now - memo.at < ttlMs) return memo.value;
  const local = buildGalleryIndex(projectRoot, { now, ttlMs });
  const posts = [...local.posts], groups = [...local.groups];
  const warnings = local.warnings.filter(warning => !warning.includes(': unknown parent '));
  const ids = new Set(posts.map(post => post.id));
  const postPaths = new Set(posts.map(post => post.path));
  for (const root of roots.slice(1)) {
    const scanned = scanPosts(root, 'gallery', { excludeIds: ids, excludePaths: postPaths, validateParents: false });
    const prefix = prefixFor(root);
    const worktree = path.basename(root);
    warnings.push(...scanned.warnings.map(warning => `${worktree}: ${warning}`));
    for (const post of scanned.posts) {
      if (ids.has(post.id)) continue;
      ids.add(post.id);
      postPaths.add(post.path);
      posts.push({ ...post, worktree, assetBase: prefix, base: prefix + post.base,
        images: post.images.map(image => ({ ...image, path: prefix + image.path })) });
      // Only new post folders need listing; inherited designs and posts stay listed once.
      for (const group of scanGroups(root, [{ dir: post.path, kind: 'screenshots' }])) {
        const groupPath = `worktrees/${tokenFor(root)}/${group.path}`;
        if (groups.some(existing => existing.path === groupPath)) continue;
        groups.push({ ...group, path: groupPath, imageBase: prefix + '/' + group.path + '/', worktree, index: group.index ? prefix + group.index : null,
          images: group.images.map(image => ({ ...image, path: prefix + image.path })) });
      }
    }
  }
  for (const post of posts) for (const parent of post.parent) {
    if (!ids.has(parent)) warnings.push(`post "${post.id}": unknown parent "${parent}"`);
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || b.mtime - a.mtime || a.id.localeCompare(b.id));
  groups.sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
  const value = { generatedAt: now, posts, groups, warnings };
  memo = { key, at: now, value };
  return value;
}

/** Resolve only registered gallery/design/snapshot assets, including a realpath check for symlinks. */
export function resolveWorktreeGalleryAsset(projectRoot, url, worktrees = galleryWorktrees(projectRoot)) {
  let parts;
  try { parts = decodeURIComponent(url.split('?')[0]).split('/').slice(1); } catch { return null; }
  const [token, ...segments] = parts;
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) return null;
  const relative = segments.join('/');
  if (!/^(?:gallery\/|docs\/design\/|tests\/[^/]*-snapshots\/)/.test(relative)) return null;
  const root = worktrees.find(candidate => tokenFor(path.resolve(candidate)) === token);
  if (!root) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const allowed = relative.startsWith('gallery/') ? 'gallery' : relative.startsWith('docs/') ? 'docs/design' : segments.slice(0, 2).join('/');
    const realFile = fs.realpathSync(path.join(root, relative));
    if (!realFile.startsWith(path.join(realRoot, allowed) + path.sep) || !fs.statSync(realFile).isFile()) return null;
    return realFile;
  } catch { return null; }
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

export function serveWorktreeGalleryAsset(projectRoot, request, response) {
  const file = ['GET', 'HEAD'].includes(request.method) && resolveWorktreeGalleryAsset(projectRoot, request.url);
  if (!file) { response.statusCode = 404; response.end('Gallery asset not found'); return; }
  response.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'HEAD') { response.end(); return; }
  const stream = fs.createReadStream(file);
  stream.on('error', () => { if (!response.headersSent) response.statusCode = 404; response.end(); });
  stream.pipe(response);
}
