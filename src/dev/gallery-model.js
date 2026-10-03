// Pure helpers for the dev gallery page: route parsing, search/filter, and the branching timeline layout.
// No DOM, no fs: unit-tested in tests/gallery-model-unit.test.mjs.

export const GALLERY_BASE = '/dev/gallery';
export const STATUSES = Object.freeze(['exploring', 'chosen', 'rejected', 'superseded', 'built']);

/**
 * '#/dev/gallery/post/orbit-v3?img=A-05.png' -> { view: 'post', id: 'orbit-v3', params }.
 * Views: folders (the group list), group (a folder path), blog, timeline, post, compare, widgets.
 */
export function parseGalleryRoute(hash = '') {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const cut = raw.indexOf('?');
  let pathPart = cut < 0 ? raw : raw.slice(0, cut);
  const params = new URLSearchParams(cut < 0 ? '' : raw.slice(cut + 1));
  pathPart = pathPart.replace(/\/+$/, '');
  const rest = pathPart.startsWith(GALLERY_BASE) ? pathPart.slice(GALLERY_BASE.length).replace(/^\/+/, '') : '';
  let decoded = rest;
  try { decoded = decodeURIComponent(rest); } catch { /* keep raw */ }
  if (!decoded) return { view: 'folders', params };
  if (decoded === 'blog') return { view: 'blog', params };
  if (decoded === 'timeline') return { view: 'timeline', params };
  if (decoded === 'widgets') return { view: 'widgets', params };
  if (decoded === 'compare') return { view: 'compare', params };
  if (decoded.startsWith('post/')) return { view: 'post', id: decoded.slice(5), params };
  return { view: 'group', group: decoded, params };
}

/** Build a gallery hash: galleryHash('post/orbit-v3', { img: 'A-05.png' }) -> '#/dev/gallery/post/orbit-v3?img=A-05.png'. */
export function galleryHash(sub = '', query = {}) {
  const qs = Object.entries(query).filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const path = sub.split('/').map(encodeURIComponent).join('/');
  return `#${GALLERY_BASE}${path ? '/' + path : ''}${qs ? '?' + qs : ''}`;
}

/** Case-insensitive match of every whitespace-separated term against the haystack parts. */
export function matchesQuery(query, ...parts) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return terms.every(term => hay.includes(term));
}

/** Groups after the search box and the root filter ('all' | 'designs' | 'screenshots'); newest first. */
export function filterGroups(groups, { query = '', kind = 'all' } = {}) {
  return groups
    .filter(group => kind === 'all' || group.kind === kind)
    .filter(group => matchesQuery(query, group.title, group.path, group.description,
      ...group.images.flatMap(image => [image.file, image.title, image.id])))
    .sort((a, b) => b.mtime - a.mtime);
}

/** Flat image list across groups for a search: [{ group, image }], title/file/folder matched. */
export function searchImages(groups, query, kind = 'all') {
  const hits = [];
  for (const group of groups) {
    if (kind !== 'all' && group.kind !== kind) continue;
    for (const image of group.images) {
      if (matchesQuery(query, image.title, image.file, image.id, image.caption, group.path, group.title)) hits.push({ group, image });
    }
  }
  return hits;
}

// ---------------------------------------------------------------- timeline

/** Children before parents (newest first); date order wins unless a parent is dated after its child. */
export function orderPosts(posts) {
  const byDate = [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const ids = new Set(posts.map(post => post.id));
  const childrenOf = new Map(posts.map(post => [post.id, []]));
  for (const post of posts) for (const parent of post.parent) if (ids.has(parent)) childrenOf.get(parent).push(post.id);
  const placed = new Set();
  const ordered = [];
  const remaining = byDate.slice();
  while (remaining.length) {
    let pick = remaining.findIndex(post => childrenOf.get(post.id).every(child => placed.has(child)));
    if (pick < 0) pick = 0; // a cycle in the front matter: place the newest and carry on
    const [post] = remaining.splice(pick, 1);
    placed.add(post.id);
    ordered.push(post);
  }
  return ordered;
}

/**
 * Layout for the git-graph-like view. Lanes are branches (the oldest branch on the left). Each row is one
 * post, newest first; its segments are what to draw in that row (all in lane coordinates):
 *   { kind: 'through', lane, color }   a full-height line in a lane (an edge passing by)
 *   { kind: 'up',      lane, color }   from the row top to this row's node (an edge arriving at a parent)
 *   { kind: 'down',    lane, color }   from this row's node to the row bottom (a child edge, same lane)
 *   { kind: 'curve',   from, to, color } from this row's node into another lane, then down to the row bottom
 * `color` is the lane index of the child that owns the edge (the renderer maps it to a branch colour).
 */
export function layoutTimeline(posts) {
  const ordered = orderPosts(posts);
  const firstSeen = new Map();
  for (const post of posts) {
    const seen = firstSeen.get(post.branch);
    if (seen === undefined || post.date < seen) firstSeen.set(post.branch, post.date);
  }
  const branches = [...firstSeen.keys()].sort((a, b) => firstSeen.get(a).localeCompare(firstSeen.get(b)) || a.localeCompare(b));
  const laneOf = new Map(branches.map((branch, index) => [branch, index]));
  const rowOf = new Map(ordered.map((post, index) => [post.id, index]));
  const rows = ordered.map(post => ({ post, lane: laneOf.get(post.branch), segments: [] }));
  const edges = [];
  for (const post of ordered) {
    const r = rowOf.get(post.id);
    const seenParents = new Set();
    for (const parentId of post.parent) {
      if (!rowOf.has(parentId) || parentId === post.id || seenParents.has(parentId)) continue;
      seenParents.add(parentId);
      const q = rowOf.get(parentId);
      const c = rows[r].lane;
      const p = rows[q].lane;
      edges.push({ from: post.id, to: parentId });
      if (q <= r) continue; // a parent dated after its child (cycle fallback): no line
      if (c === p) rows[r].segments.push({ kind: 'down', lane: c, color: c });
      else rows[r].segments.push({ kind: 'curve', from: c, to: p, color: c });
      for (let k = r + 1; k < q; k += 1) rows[k].segments.push({ kind: 'through', lane: p, color: c });
      rows[q].segments.push({ kind: 'up', lane: p, color: c });
    }
  }
  return { branches, rows, edges };
}

/** Status -> a short human label used by the badge. */
export const statusLabel = status => (STATUSES.includes(status) ? status : status || 'exploring');
