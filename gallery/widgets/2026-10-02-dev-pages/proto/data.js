/* global fetch */
// Data for the dev-page prototypes: the 43 real posts of the repo (posts.json, generated from their front matter)
// plus this post, the image pool for the thumbnail cards, and the lineage helpers. Prototype only.
export const ROOT = '../../../../';
const raw = await (await fetch('posts.json')).json();
raw.push({ id: 'widgets-dev-pages', title: 'Dev pages: timeline graph, thumbnail card, blog post, compare view', date: '2026-10-02', branch: 'widgets', parent: ['widget-inventory'], status: 'exploring', decision: 'pending user choice', n: 25, dir: 'gallery/widgets/2026-10-02-dev-pages', img: [] });

// Fallback pictures for posts whose images live in docs/design (so every row can show a thumbnail)
const FALL = ['docs/design/orbit-v3/A-01-idle.png', 'docs/design/orbit-v3/A-05-results.png', 'docs/design/orbit-v3/A-07-history.png', 'docs/design/orbit-v3/A-08-drill.png', 'docs/design/orbit-v3/B-05-results.png', 'docs/design/orbit-v3/A-10-past-solve.png'];
export const thumbs = (p, k = 3) => {
  const own = p.img.map(f => `${ROOT}${p.dir}/${f}`);
  const i = raw.indexOf(p);
  const extra = [0, 1, 2].map(j => ROOT + FALL[(i + j) % FALL.length]);
  return [...own, ...extra].slice(0, k);
};

export const posts = raw;
export const byId = new Map(posts.map(p => [p.id, p]));

/** Parents before children, older first; ties by id. */
export function topo(list) {
  const ids = new Set(list.map(p => p.id));
  const placed = new Set();
  const out = [];
  const rest = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  while (rest.length) {
    let i = rest.findIndex(p => p.parent.every(x => !ids.has(x) || placed.has(x)));
    if (i < 0) i = 0;
    const [p] = rest.splice(i, 1);
    placed.add(p.id);
    out.push(p);
  }
  return out;
}
export const ord = topo(posts);                       // oldest first
export const idx = new Map(ord.map((p, i) => [p.id, i]));
export const branches = (() => {
  const first = new Map();
  for (const p of ord) if (!first.has(p.branch)) first.set(p.branch, idx.get(p.id));
  return [...first.keys()];
})();
export const count = b => posts.filter(p => p.branch === b).length;
export const kids = new Map(posts.map(p => [p.id, []]));
for (const p of posts) for (const par of p.parent) kids.get(par)?.push(p.id);

// The chosen path: the lineage of what the user chose and built, from the first sketches to the newest post.
export const PATH = ['first-sketches', 'brain-v2-directions', 'brain-v2-orbit', 'brain-v2-themes', 'orbit-wins', 'orbit-v3', 'widget-inventory', 'widgets-W-21-moves', 'widgets-W-21-moves-v2', 'widgets-system-check', 'widgets-dev-pages'];
export const onPath = new Set(PATH);
// every path node but the first hangs from the previous path node (system-check also lists W-17 pairs; dev-pages is a sibling in the data)
export const PATH_EDGES = PATH.slice(1).map((id, i) => [id, PATH[i]]);

// Side posts hang from the nearest path ancestor
export function attach(p) {
  const seen = new Set();
  const walk = id => {
    if (onPath.has(id)) return id;
    if (seen.has(id)) return null;
    seen.add(id);
    for (const par of byId.get(id)?.parent || []) { const r = walk(par); if (r) return r; }
    return null;
  };
  return walk(p.id);
}
export const side = posts.filter(p => !onPath.has(p.id));
export const attachedTo = new Map(PATH.map(id => [id, []]));
export const roots = [];
for (const p of side) { const a = attach(p); if (a) attachedTo.get(a).push(p); else roots.push(p); }

export const short = id => id.replace(/^widgets-/, '').replace(/^brain-v2-/, 'v2-');
export const dateLabel = d => { const [, m, day] = d.split('-'); return `${['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][+m]} ${+day}`; };

// Image pool for the card prototypes (real files in this repo)
const SC = 'gallery/widgets/2026-10-02-system-check';
const BT = 'gallery/widgets/2026-10-02-buttons';
const OV = 'docs/design/orbit-v3';
export const pool = [
  { id: 'A-05', title: 'results: the dotted connector', dir: OV, file: 'A-05-results.png', cap: '1440 x 900 · dark', tall: false },
  { id: 'A-07', title: 'history by session', dir: OV, file: 'A-07-history.png', cap: '1440 x 900 · dark', tall: false },
  { id: 'A-08', title: 'a drill round', dir: OV, file: 'A-08-drill.png', cap: '1440 x 900 · dark', tall: false },
  { id: 'A-09', title: 'phone, solving', dir: OV, file: 'A-09-phone.png', cap: '390 x 844 · dark', tall: true },
  { id: 'A-10', title: 'past solve, cube highlighted', dir: OV, file: 'A-10-past-solve.png', cap: '1440 x 900 · dark', tall: false },
  { id: 'SC-01', title: 'solve with settings open (desktop)', dir: SC, file: 'SC-01-solve-settings-desktop.png', cap: 'dark above, light below', tall: true },
  { id: 'SC-03', title: 'a drill round (desktop)', dir: SC, file: 'SC-03-drill-round-desktop.png', cap: 'dark above, light below', tall: true },
  { id: 'SC-05', title: 'alg playback (desktop)', dir: SC, file: 'SC-05-alg-playback-desktop.png', cap: 'dark above, light below', tall: true },
  { id: 'W-04-00', title: 'the three options side by side', dir: BT, file: 'W-04-00-compare-options.png', cap: 'dark above, light below', tall: false },
  { id: 'W-04-04', title: 'option 1: drill round answers (A-08)', dir: BT, file: 'W-04-04-option1-drill.png', cap: 'answer pills with number keys', tall: false },
  { id: 'A-01', title: 'idle: the cube and the open orbit', dir: OV, file: 'A-01-idle.png', cap: '1440 x 900 · dark', tall: false },
  { id: 'B-05', title: 'results, direction B', dir: OV, file: 'B-05-results.png', cap: '1440 x 900 · dark', tall: false },
].map(x => ({ ...x, url: `${ROOT}${x.dir}/${x.file}` }));
