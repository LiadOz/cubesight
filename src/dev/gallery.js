// Dev-only image gallery and development blog at #/dev/gallery (see gallery/README.md).
// Loaded by main.js only inside `import.meta.env.DEV`; the data comes from the Vite dev plugin at /__gallery.
// Reuses the shared design-gallery lightbox (docs/design/_gallery/lightbox.js) for zoom, loupe and arrow browsing.
import '../pages/page.css';
import '../../docs/design/_gallery/lightbox.css';
import '../../docs/design/_gallery/lightbox.js';
import './gallery.css';
import { mountApprovedWidgetGallery } from './approved-widget-gallery.js';
import { createButton, createChip, createFilledSelect, createSearch, createSegmented, createWipeComparison } from '../ui/shared/index.js';
import { syncPageTokens } from '../pages/tokens.js';
import { renderMarkdown } from './gallery-markdown.js';
import {
  GALLERY_BASE, filterGroups, galleryHash, layoutTimeline, matchesQuery, parseGalleryRoute, searchImages, statusLabel,
} from './gallery-model.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BRANCH_COLORS = ['#3dbfad', '#e0a13a', '#6aa6ff', '#d878b8', '#9acd5a', '#b08cf0', '#ef7b6b', '#7ac7d8'];
const branchColor = lane => BRANCH_COLORS[lane % BRANCH_COLORS.length];
const MAX_FLAT = 400;
const STALE_MS = 8000;

function ago(ms) {
  const minutes = (Date.now() - ms) / 60000;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 60 * 36) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / 60 / 24)} d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const fullDate = ms => new Date(ms).toLocaleString();
const niceDate = iso => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const kindLabel = kind => (kind === 'designs' ? 'design' : kind === 'screenshots' ? 'agent screenshots' : kind);
const labelOf = image => [image.id, image.title].filter(Boolean).join(' · ');

export function mountGalleryPage(host) {
  const page = document.createElement('section');
  page.className = 'cs-page brain g-page';
  page.dataset.brainStyle = 'orbit';
  page.dataset.opt = '3';
  page.dataset.testid = 'gallery-page';
  host.classList.add('cs-host');
  host.textContent = '';
  host.append(page);

  let data = null;
  let loading = null;
  let fetchedAt = 0;
  let signature = '';
  let active = false;
  let query = '';
  let kind = 'all';
  let branch = 'all';
  let compareSel = [];
  let observer = null;
  let lastRouteKey = '';
  let branchOrder = [];
  let widgetGallery = null;
  let compareWidget = null;
  let compareSelects = [];
  let timelineMode = 'graph';
  const lightbox = () => window.__lightbox;

  // ------------------------------------------------------------ data

  async function load(force = false) {
    if (loading) return loading;
    if (!force && data && Date.now() - fetchedAt < STALE_MS) return null;
    loading = fetch('/__gallery', { cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(`/__gallery ${response.status}`); return response.json(); })
      .then(next => {
        const nextSig = `${next.groups.length}:${next.posts.length}:${next.groups.reduce((n, g) => n + g.count + g.mtime, 0)}:${next.posts.reduce((n, p) => n + p.mtime, 0)}`;
        const changed = nextSig !== signature;
        data = next; signature = nextSig; fetchedAt = Date.now();
        return changed;
      })
      .catch(error => { page.innerHTML = `<p class="g-error" role="alert">Could not load the gallery index: ${esc(error.message)}. It only exists on the Vite dev server.</p>`; throw error; })
      .finally(() => { loading = null; });
    return loading;
  }

  const postById = id => data.posts.find(post => post.id === id);
  const groupByPath = path => data.groups.find(group => group.path === path);
  const hashFor = (sub, q) => galleryHash(sub, q);
  const absLink = hash => `${location.origin}${location.pathname}${hash}`;

  // ------------------------------------------------------------ pieces

  const statusBadge = status => `<span class="g-status g-status-${esc(status)}">${esc(statusLabel(status))}</span>`;

  function card(image, { link, sub = '' }) {
    const label = labelOf(image) || image.file;
    return `<figure class="g-card" data-file="${esc(image.file)}">
      <a class="g-thumb" href="${esc(image.path)}" data-file="${esc(image.file)}" data-path="${esc(image.path)}" aria-label="${esc(label)}"><img loading="lazy" decoding="async" src="${esc(image.path)}" alt="${esc(label)}" data-file="${esc(image.file)}" data-path="${esc(image.path)}"></a>
      <figcaption>
        <span class="g-id">${esc(image.id || '')}</span>
        <span class="g-title" title="${esc(image.file)}">${esc(image.title)}</span>
        ${sub ? `<span class="g-sub">${esc(sub)}</span>` : ''}
        <button type="button" class="g-copy" data-copy="${esc(link)}" aria-label="Copy link to ${esc(label)}">copy link</button>
      </figcaption>
    </figure>`;
  }

  const tabs = view => {
    const items = [
      ['folders', 'Folders', hashFor('')], ['blog', 'Blog', hashFor('blog')], ['timeline', 'Timeline', hashFor('timeline')], ['widgets', 'Widgets', hashFor('widgets')],
    ];
    const current = view === 'group' ? 'folders' : view === 'post' || view === 'compare' ? 'blog' : view;
    return `<nav class="g-tabs" aria-label="Gallery">${items.map(([id, label, href]) => `<a href="${href}" ${id === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
      <button type="button" class="g-refresh" data-refresh title="Reload the index">refresh</button></nav>`;
  };

  const chips = (name, options, current) => `<div class="g-chips" role="group" aria-label="${esc(name)}" data-chip-name="${esc(name)}" data-chip-options="${esc(JSON.stringify(options))}" data-chip-current="${esc(current)}"></div>`;

  const search = placeholder => `<div class="g-search-host" data-search-placeholder="${esc(placeholder)}"></div>`;

  const head = (view, title, sub) => `<header class="cs-head g-head"><p class="g-eyebrow">dev / gallery</p><h1>${title}</h1>${sub ? `<p class="cs-sub">${sub}</p>` : ''}${tabs(view)}</header>`;

  // ------------------------------------------------------------ views

  function foldersView() {
    const kinds = [['all', 'all'], ['designs', 'designs'], ['screenshots', 'agent screenshots']];
    let body;
    if (query.trim()) {
      const hits = searchImages(data.groups, query, kind);
      const shown = hits.slice(0, MAX_FLAT);
      body = `<p class="g-count">${hits.length} image${hits.length === 1 ? '' : 's'} match</p>
        <div class="g-grid" data-lb-scope data-scope-id="search">${shown.map(({ group, image }) => card(image, { link: absLink(hashFor(group.path, { img: image.file })), sub: group.path.replace(/^docs\/design\//, '') })).join('')}</div>
        ${hits.length > shown.length ? `<p class="g-count">Showing the first ${MAX_FLAT}. Narrow the search to see the rest.</p>` : ''}`;
    } else {
      const groups = filterGroups(data.groups, { kind });
      body = `<div class="g-groups">${groups.map(group => `<a class="g-group" href="${hashFor(group.path)}" data-testid="group-card" data-group="${esc(group.path)}">
          <span class="g-thumbs">${group.images.slice(0, 3).map(image => `<img loading="lazy" decoding="async" src="${esc(image.path)}" alt="">`).join('')}</span>
          <span class="g-group-body">
            <span class="g-group-title">${esc(group.title)}</span>
            <span class="g-group-path">${esc(group.path)}</span>
            ${group.description ? `<span class="g-group-desc">${esc(group.description)}</span>` : ''}
            <span class="g-group-meta"><span class="g-kind">${esc(kindLabel(group.kind))}</span> ${group.count} image${group.count === 1 ? '' : 's'} · updated <time title="${esc(fullDate(group.mtime))}">${esc(ago(group.mtime))}</time></span>
          </span></a>`).join('') || '<p class="g-empty">No folders match.</p>'}</div>`;
    }
    return `${head('folders', 'Gallery', 'Every design mockup and agent screenshot, newest folders first.')}
      <div class="g-toolbar">${search('Search title, file or folder')}${chips('kind', kinds, kind)}</div>${body}`;
  }

  function widgetsView() {
    const families = [
      ['widgets-W-04-buttons', 'Buttons · quiet fill', 'Cream primary, surface secondary, text actions; keyboard shortcuts stay flat inside buttons.'],
      ['widgets-selection-controls', 'Selection controls · ink', 'Selected chips, segmented choices, toggles, selects and answer choices share one ink system with a check.'],
      ['widgets-inputs', 'Inputs · filled pills', 'Filled pill fields, search in the section head, and the approved range thumb.'],
      ['widgets-containers', 'Containers · frameless', 'Sections, groups, panels, disclosures, drawers and dialogs use one ladder.'],
      ['widgets-lists-data', 'Lists · open rows', 'Mini Orbit rows, count pills, text tags and empty states.'],
      ['widgets-navigation', 'Navigation · side rail', 'Side rail, arrow links with crumbs and the global cube chip drawer.'],
      ['widgets-W-16-status', 'Status · bottom right', 'One-line status and a bottom-right toast; work in progress uses the Orbit.'],
      ['widgets-W-17-keycaps', 'Keycaps · bevelled', 'Only keyboard keys are bevelled; paired keys use cap–cap form.'],
      ['widgets-W-21-moves-v2', 'Move display · Orbit and phone wrap', 'Move labels sit on the desktop Orbit and wrap on phones; sections are spacing only.'],
      ['widgets-time-coach', 'Timer and coach', 'Plain timer digits, the word “hidden”, praise-first coach copy and the dotted marker connector.'],
      ['widgets-progress-charts', 'Progress and charts', 'Orbit for a few structural parts, real charts for many data points, plus the approved wipe caret.'],
      ['widgets-dev-pages', 'Development pages', 'Timeline graph, gallery image cards, two-column post and wipe comparison.'],
      ['widgets-system-check', 'System check', 'The chosen widgets together across solve, results, drills, history, alg playback and phone.'],
    ];
    const core = `<a class="g-widget-card" href="${hashFor('docs/design/orbit-v3')}"><b>Cube and Orbit · shared foundation</b><span>One Cube, one Orbit, the A-frame header and nine flow fixtures.</span><i>open the Cube and Orbit gallery →</i></a>`;
    const cards = families.map(([id, title, description]) => `<a class="g-widget-card" href="${hashFor(`post/${id}`)}"><b>${esc(title)}</b><span>${esc(description)}</span><i>view approved prototype and states →</i></a>`).join('');
    return `${head('widgets', 'Approved widgets', 'The complete approved set is registered here. Each prototype post records its states and exact chosen option.')}
      <div data-approved-widget-gallery></div><p class="g-count">47 decisions · 37 widget families · prototype detail opens from each row</p><div class="g-widget-grid">${core}${cards}</div>`;
  }

  function groupView(path) {
    const group = groupByPath(path);
    if (!group) return `${head('group', 'Folder not found', '')}<p class="g-empty">No images under <code>${esc(path)}</code>. <a href="${hashFor('')}">All folders</a></p>`;
    const images = query.trim() ? group.images.filter(image => matchesQuery(query, image.title, image.file, image.id, image.caption)) : group.images;
    const posts = data.posts.filter(post => post.images.some(image => decodeURIComponent(image.path).startsWith(`/${group.path}/`)));
    return `${head('group', esc(group.title), esc(group.description))}
      <p class="g-crumbs"><a href="${hashFor('')}">all folders</a> / <code>${esc(group.path)}</code> · <span class="g-kind">${esc(kindLabel(group.kind))}</span> ${group.count} images · updated <time title="${esc(fullDate(group.mtime))}">${esc(ago(group.mtime))}</time>
        ${group.index ? ` · <a href="${esc(group.index)}" target="_blank" rel="noopener">static page</a>` : ''}
        ${posts.map(post => ` · <a href="${hashFor(`post/${post.id}`)}">post: ${esc(post.title)}</a>`).join('')}</p>
      <div class="g-toolbar">${search('Filter this folder')}</div>
      <div class="g-grid" data-lb-scope data-scope-id="${esc(group.path)}">${images.map(image => card(image, { link: absLink(hashFor(group.path, { img: image.file })) })).join('') || '<p class="g-empty">Nothing matches.</p>'}</div>`;
  }

  // Markdown: relative image names resolve against the post's folder; '/x' is a project path.
  const resolver = post => (name, role) => {
    if (/^(?:https?:|#|\/)/i.test(name)) return name;
    if (role === 'link' && !/\.(?:png|jpe?g|webp|svg)$/i.test(name)) return name;
    return post.base + name.split('/').map(encodeURIComponent).join('/');
  };

  function postArticle(post, { full }) {
    const children = data.posts.filter(other => other.parent.includes(post.id));
    const link = image => absLink(hashFor(`post/${post.id}`, { img: image.file }));
    const images = post.images;
    return `<article class="g-post" id="post-${esc(post.id)}" data-post="${esc(post.id)}" data-testid="post" data-lb-scope data-scope-id="${esc(post.id)}">
      <header>
        <p class="g-meta"><time datetime="${esc(post.date)}">${esc(niceDate(post.date))}</time><span class="g-branch" style="--lane:${branchColor(Math.max(0, branchOrder.indexOf(post.branch)))}">${esc(post.branch)}</span>${statusBadge(post.status)}${post.author ? `<span class="g-author">${esc(post.author)}</span>` : ''}</p>
        <h2>${full ? esc(post.title) : `<a href="${hashFor(`post/${post.id}`)}">${esc(post.title)}</a>`}</h2>
        ${post.decision ? `<p class="g-decision">${esc(post.decision)}</p>` : ''}
      </header>
      <div class="g-md" ${full ? 'id="post-body"' : ''}>${renderMarkdown(post.body, resolver(post))}</div>
      ${images.length ? `<div class="${full ? 'g-grid' : 'g-strip'}" ${full ? 'id="post-images"' : ''}>${images.map(image => card(image, { link: link(image) })).join('')}</div>` : ''}
      <footer class="g-post-foot">
        ${post.parent.length ? `<span>from ${post.parent.map(id => postById(id) ? `<a href="${hashFor(`post/${id}`)}">${esc(postById(id).title)}</a>` : esc(id)).join(', ')}</span>` : ''}
        ${children.length ? `<span>led to ${children.map(child => `<a href="${hashFor(`post/${child.id}`)}">${esc(child.title)}</a>`).join(', ')}</span>` : ''}
        <span>${images.length} image${images.length === 1 ? '' : 's'}</span>
        ${post.parent[0] && postById(post.parent[0]) ? `<a href="${hashFor('compare', { a: post.parent[0], b: post.id })}">compare with parent</a>` : ''}
        <button type="button" class="g-copy" data-copy="${esc(absLink(hashFor(`post/${post.id}`)))}">copy link</button>
      </footer>
    </article>`;
  }

  function blogView() {
    const branches = ['all', ...new Set(data.posts.map(post => post.branch))];
    const posts = data.posts.filter(post => (branch === 'all' || post.branch === branch)
      && matchesQuery(query, post.title, post.id, post.branch, post.status, post.decision, post.body, post.author));
    return `${head('blog', 'Development blog', 'One post per exploration or iteration, newest first. Branches are lanes on the timeline.')}
      <div class="g-toolbar">${search('Search posts')}${chips('branch', branches.map(b => [b, b]), branch)}</div>
      <div class="g-posts">${posts.map(post => postArticle(post, { full: false })).join('') || '<p class="g-empty">No posts match.</p>'}</div>`;
  }

  function postView(id) {
    const post = postById(id);
    if (!post) return `${head('post', 'Post not found', '')}<p class="g-empty">No post with id <code>${esc(id)}</code>. <a href="${hashFor('blog')}">All posts</a></p>`;
    const related = post.parent.map(parentId => postById(parentId)).filter(Boolean);
    const children = data.posts.filter(other => other.parent.includes(post.id));
    const rail = `<aside class="g-post-rail"><p class="g-meta"><time datetime="${esc(post.date)}">${esc(niceDate(post.date))}</time><span class="g-branch">${esc(post.branch)}</span>${statusBadge(post.status)}</p>
      ${post.decision ? `<p class="g-decision">${esc(post.decision)}</p>` : ''}<nav class="g-post-rail__nav" aria-label="Post sections"><a href="#post-body">post</a>${post.images.length ? `<a href="#post-images">images · ${post.images.length}</a>` : ''}<a href="#post-lineage">lineage</a></nav>
      <div class="g-post-rail__lineage" id="post-lineage"><span>grew out of</span>${related.map(item => `<a href="${hashFor(`post/${item.id}`)}">${esc(item.title)}</a>`).join('') || '<span>original post</span>'}<span>led to</span>${children.map(item => `<a href="${hashFor(`post/${item.id}`)}">${esc(item.title)}</a>`).join('') || '<span>no follow-up posts</span>'}</div>
      <a class="g-post-rail__back" href="${hashFor('blog')}">← all posts</a></aside>`;
    return `${head('post', 'Post', '')}<p class="g-crumbs"><a href="${hashFor('blog')}">blog</a> / <code>${esc(post.id)}</code></p><div class="g-post-layout">${rail}<div class="g-post-main">${postArticle(post, { full: true })}</div></div>`;
  }

  const laneWidth = lanes => (lanes > 7 ? 13 : 18);
  const NODE_Y = 30;
  function graphSvg(row, laneCount) {
    const width = laneCount * laneWidth(laneCount) + 8;
    const x = lane => 10 + lane * laneWidth(laneCount);
    const parts = row.segments.map(segment => {
      const color = branchColor(segment.color);
      if (segment.kind === 'through') return `<line x1="${x(segment.lane)}" y1="0" x2="${x(segment.lane)}" y2="100%" stroke="${color}" stroke-width="2"/>`;
      if (segment.kind === 'up') return `<line x1="${x(segment.lane)}" y1="0" x2="${x(segment.lane)}" y2="${NODE_Y}" stroke="${color}" stroke-width="2"/>`;
      if (segment.kind === 'down') return `<line x1="${x(segment.lane)}" y1="${NODE_Y}" x2="${x(segment.lane)}" y2="100%" stroke="${color}" stroke-width="2"/>`;
      const fromX = x(segment.from); const toX = x(segment.to); const endY = NODE_Y + 34;
      return `<path d="M${fromX} ${NODE_Y} C${fromX} ${NODE_Y + 20} ${toX} ${endY - 20} ${toX} ${endY}" fill="none" stroke="${color}" stroke-width="2"/>
        <line x1="${toX}" y1="${endY}" x2="${toX}" y2="100%" stroke="${color}" stroke-width="2"/>`;
    }).join('');
    const color = branchColor(row.lane);
    const hollow = row.post.status === 'rejected' || row.post.status === 'superseded';
    const node = `<circle class="g-node g-node-${esc(row.post.status)}" cx="${x(row.lane)}" cy="${NODE_Y}" r="6.5" fill="${hollow ? 'var(--b-bg)' : color}" stroke="${color}" stroke-width="2.5"/>`
      + (row.post.status === 'built' ? `<circle cx="${x(row.lane)}" cy="${NODE_Y}" r="2.2" fill="var(--b-bg)"/>` : '');
    return `<svg class="g-graph" width="${width}" aria-hidden="true">${parts}${node}</svg>`;
  }

  function timelineView() {
    const layout = layoutTimeline(data.posts);
    const lanes = Math.max(1, layout.branches.length);
    const rows = layout.rows.map(row => {
      const post = row.post;
      const thumbs = post.images.slice(0, 4);
      const note = post.decision || (post.body.replace(/[#*`>\-\d.[\]()!]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160));
      return `<li class="g-trow" data-post="${esc(post.id)}" data-testid="timeline-node">
        <div class="g-gcell" style="width:${lanes * laneWidth(lanes) + 8}px">${graphSvg(row, lanes)}</div>
        <div class="g-tcard">
          <p class="g-meta"><time datetime="${esc(post.date)}">${esc(niceDate(post.date))}</time><span class="g-branch" style="--lane:${branchColor(row.lane)}">${esc(post.branch)}</span>${statusBadge(post.status)}</p>
          <h3><a href="${hashFor(`post/${post.id}`)}">${esc(post.title)}</a></h3>
          ${note ? `<p class="g-note">${esc(note)}</p>` : ''}
          ${thumbs.length ? `<a class="g-tthumbs" href="${hashFor(`post/${post.id}`)}" aria-label="Open ${esc(post.title)}">${thumbs.map(image => `<img loading="lazy" decoding="async" src="${esc(image.path)}" alt="">`).join('')}<span>${post.images.length}</span></a>` : ''}
          <label class="g-cmp"><input type="checkbox" data-cmp="${esc(post.id)}" ${compareSel.includes(post.id) ? 'checked' : ''}> compare</label>
        </div>
      </li>`;
    }).join('');
    const legend = layout.branches.map((name, lane) => `<span class="g-legend-item"><i style="background:${branchColor(lane)}"></i>${esc(name)}</span>`).join('');
    const ringView = timelineMode === 'rings' ? ringTimelineSvg(layout) : '';
    return `${head('timeline', 'Timeline', 'Explorations as a branching history. Switch between the git graph and branches as rings.')}
      <div class="g-timeline-controls"><div data-timeline-mode></div><div class="g-legend">${legend}</div></div>
      <div class="g-compare-bar" data-compare-bar ${compareSel.length === 2 ? '' : 'hidden'}>
        ${compareSel.length === 2 ? `<a class="g-btn" href="${hashFor('compare', { a: compareSel[0], b: compareSel[1] })}" data-testid="compare-go">Compare ${esc(compareSel[0])} with ${esc(compareSel[1])}</a>` : ''}
      </div>
      ${timelineMode === 'graph' ? `<ol class="g-timeline">${rows || '<li class="g-empty">No posts yet.</li>'}</ol>` : `<div class="g-timeline-rings" role="img" aria-label="Timeline by branch, newest posts around the outer rings">${ringView}</div>`}`;
  }

  function ringTimelineSvg(layout) {
    const width = 1000, height = 740, cx = 500, cy = 370;
    const branches = layout.branches;
    const radiusFor = branch => branches.length < 2 ? 210 : 130 + branches.indexOf(branch) * (200 / (branches.length - 1));
    const angleFor = index => (-145 + (layout.rows.length < 2 ? 0 : 290 * index / (layout.rows.length - 1))) * Math.PI / 180;
    const positions = new Map(layout.rows.map((row, index) => {
      const angle = angleFor(index), radius = radiusFor(row.post.branch);
      return [row.post.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), radius, angle, row }];
    }));
    const tracks = branches.map((branch, index) => {
      const radius = radiusFor(branch), count = layout.rows.filter(row => row.post.branch === branch).length;
      const color = branchColor(index);
      return `<path d="M ${cx + radius * Math.cos(-145 * Math.PI / 180)} ${cy + radius * Math.sin(-145 * Math.PI / 180)} A ${radius} ${radius} 0 1 1 ${cx + radius * Math.cos(145 * Math.PI / 180)} ${cy + radius * Math.sin(145 * Math.PI / 180)}" fill="none" stroke="var(--b-track)" stroke-width="1.5"/><text x="${cx}" y="${cy + radius + 15}" text-anchor="middle" class="g-ring-label" fill="${color}">${esc(branch)} · ${count}</text>`;
    }).join('');
    const edges = layout.edges.map(edge => {
      const from = positions.get(edge.to), to = positions.get(edge.from);
      if (!from || !to) return '';
      const midAngle = (from.angle + to.angle) / 2, midRadius = (from.radius + to.radius) * .46;
      const controlX = cx + midRadius * Math.cos(midAngle), controlY = cy + midRadius * Math.sin(midAngle);
      const sameBranch = from.row.post.branch === to.row.post.branch;
      return `<path d="M${from.x.toFixed(1)} ${from.y.toFixed(1)} Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}" fill="none" stroke="${sameBranch ? 'var(--b-muted)' : 'var(--b-faint)'}" stroke-width="${sameBranch ? 1.4 : 1}" opacity="${sameBranch ? '.4' : '.22'}"/>`;
    }).join('');
    const nodes = layout.rows.map(row => {
      const point = positions.get(row.post.id), color = branchColor(row.lane), hollow = ['rejected', 'superseded'].includes(row.post.status);
      return `<a href="${hashFor(`post/${row.post.id}`)}" aria-label="${esc(row.post.title)}"><circle class="g-ring-node" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${row.post.status === 'built' ? 6 : 4.5}" fill="${hollow ? 'var(--b-bg)' : color}" stroke="${color}" stroke-width="2"><title>${esc(row.post.title)} · ${esc(row.post.branch)} · ${esc(row.post.date)}</title></circle></a>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="presentation">${tracks}${edges}${nodes}</svg>`;
  }

  function comparePane(side, id, file) {
    const post = postById(id) || data.posts[0];
    const images = post?.images || [];
    const image = images.find(item => item.file === file) || images[0];
    return `<section class="g-pane" data-lb-scope data-scope-id="compare-${side}">
      <div data-cmp-post-host="${side}"></div>
      ${post ? `<p class="g-meta"><time>${esc(niceDate(post.date))}</time><span class="g-branch">${esc(post.branch)}</span>${statusBadge(post.status)}</p>
        <p class="g-decision">${esc(post.decision)}</p>
        <div data-cmp-image-host="${side}"></div>
        ${image ? `<img class="g-big" src="${esc(image.path)}" alt="${esc(labelOf(image))}" data-file="${esc(image.file)}">` : '<p class="g-empty">This post has no images.</p>'}` : ''}
    </section>`;
  }

  function compareView(params) {
    const a = params.get('a') || data.posts[1]?.id || data.posts[0]?.id;
    const b = params.get('b') || data.posts[0]?.id;
    return `${head('compare', 'Compare', 'Wipe first, with side-by-side and overlay one click away. Pick any post and image on each side.')}
      <p class="g-crumbs"><a href="${hashFor('timeline')}">timeline</a> / compare</p>
      <div class="g-compare-controls"><span class="g-eyebrow">comparison view</span><div data-compare-modes></div></div>
      <div class="g-compare">${comparePane('a', a, params.get('ai'))}${comparePane('b', b, params.get('bi'))}</div>
      <div data-compare-wipe></div>`;
  }

  function mountCompareWidget() {
    const hostEl = page.querySelector('[data-compare-wipe]');
    const modeHost = page.querySelector('[data-compare-modes]');
    const images = [...page.querySelectorAll('.g-pane img.g-big')];
    if (!hostEl || !modeHost || images.length !== 2) return;
    const routeCompareParams = parseGalleryRoute(location.hash).params;
    for (const side of ['a', 'b']) {
      const postHost = page.querySelector(`[data-cmp-post-host="${side}"]`);
      const imageHost = page.querySelector(`[data-cmp-image-host="${side}"]`);
      const selectedPost = routeCompareParams.get(side) || data.posts[side === 'a' ? 1 : 0]?.id;
      const postSelect = createFilledSelect(postHost, { label: `post ${side.toUpperCase()}`, name: `post-${side}`, value: selectedPost, options: data.posts.map(item => ({ value: item.id, label: `${item.date} · ${item.title}` })) });
      compareSelects.push(postSelect);
      postSelect.input.dataset.cmpPost = side;
      const activePost = postById(selectedPost) || data.posts[0];
      const activeImage = routeCompareParams.get(`${side}i`);
      const imageSelect = createFilledSelect(imageHost, { label: `image ${side.toUpperCase()}`, name: `image-${side}`, value: activeImage || activePost.images[0]?.file, options: activePost.images.map(item => ({ value: item.file, label: labelOf(item) || item.file })) });
      compareSelects.push(imageSelect);
      imageSelect.input.dataset.cmpImage = side;
    }
    const before = images[0].cloneNode(); const after = images[1].cloneNode();
    before.alt = 'left comparison image'; after.alt = 'right comparison image';
    compareWidget = createWipeComparison(hostEl, { before, after, value: 50, mode: 'wipe', label: 'Compare the selected images' });
    createSegmented(modeHost, { label: 'Comparison mode', value: 'wipe', options: [{ value: 'wipe', label: 'wipe' }, { value: 'side-by-side', label: 'side by side' }, { value: 'overlay', label: 'overlay' }], onChange: mode => {
      compareWidget?.setMode(mode); page.dataset.compareMode = mode;
    } });
    page.classList.add('g-page--compare'); page.dataset.compareMode = 'wipe';
  }

  // ------------------------------------------------------------ render and deep links

  function render() {
    if (!data) return;
    widgetGallery?.destroy(); widgetGallery = null;
    compareWidget?.destroy(); compareWidget = null;
    compareSelects.forEach(select => select.destroy()); compareSelects = [];
    page.classList.remove('g-page--compare'); delete page.dataset.compareMode;
    const route = parseGalleryRoute(location.hash);
    const scrollKey = `${route.view}:${route.group || route.id || ''}`;
    const keepScroll = scrollKey === lastRouteKey;
    lastRouteKey = scrollKey;
    branchOrder = layoutTimeline(data.posts).branches;
    const focused = document.activeElement?.matches?.('[data-search]');
    const y = window.scrollY;
    let html;
    switch (route.view) {
      case 'blog': html = blogView(); break;
      case 'timeline': html = timelineView(); break;
      case 'post': html = postView(route.id); break;
      case 'compare': html = compareView(route.params); break;
      case 'group': html = groupView(route.group); break;
      case 'widgets': html = widgetsView(); break;
      default: html = foldersView();
    }
    const warn = data.warnings?.length ? `<details class="g-warn"><summary>${data.warnings.length} gallery warning${data.warnings.length === 1 ? '' : 's'}</summary><ul>${data.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : '';
    page.innerHTML = html + warn;
    page.querySelectorAll('.g-search-host').forEach(searchHost => {
      const input = createSearch(searchHost, { placeholder: searchHost.dataset.searchPlaceholder, label: searchHost.dataset.searchPlaceholder, value: query }).input;
      input.dataset.search = '';
      input.autocomplete = 'off';
    });
    page.querySelectorAll('.g-chips[data-chip-options]').forEach(chipHost => {
      const options = JSON.parse(chipHost.dataset.chipOptions);
      options.forEach(([value, label]) => {
        const chip = createChip(chipHost, { label, pressed: value === chipHost.dataset.chipCurrent });
        chip.dataset.chip = chipHost.dataset.chipName;
        chip.dataset.value = value;
      });
    });
    page.querySelectorAll('.g-copy').forEach(previous => {
      const button = createButton(previous.parentElement, { label: 'copy link', variant: 'text', size: 's' });
      button.classList.add('g-copy');
      button.dataset.copy = previous.dataset.copy;
      if (previous.hasAttribute('aria-label')) button.setAttribute('aria-label', previous.getAttribute('aria-label'));
      previous.replaceWith(button);
    });
    const refresh = page.querySelector('.g-refresh');
    if (refresh) {
      const button = createButton(refresh.parentElement, { label: 'refresh', variant: 'text', size: 's' });
      button.classList.add('g-refresh'); button.dataset.refresh = ''; button.title = 'Reload the index'; refresh.replaceWith(button);
    }
    if (route.view === 'widgets') widgetGallery = mountApprovedWidgetGallery(page.querySelector('[data-approved-widget-gallery]'));
    if (route.view === 'compare') mountCompareWidget();
    if (route.view === 'timeline') createSegmented(page.querySelector('[data-timeline-mode]'), { label: 'Timeline view', value: timelineMode, options: [{ value: 'graph', label: 'git graph' }, { value: 'rings', label: 'branches as rings' }], onChange: mode => { if (mode === timelineMode) return; timelineMode = mode; render(); } });
    document.title = `gallery · CubeSight`;
    syncPageTokens(page);
    lightbox()?.setScope(null);
    if (focused) { const input = page.querySelector('[data-search]'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }
    window.scrollTo(0, keepScroll ? y : 0);
    openFromUrl(route);
  }

  function scopeFor(route) {
    const wanted = route.params.get('post');
    const scopes = [...page.querySelectorAll('[data-lb-scope]')];
    return scopes.find(scope => wanted && scope.dataset.scopeId === wanted) || scopes[0] || null;
  }

  function openFromUrl(route) {
    const file = route.params.get('img');
    if (!file) { if (lightbox() && document.querySelector('.lb-root.lb-open')) lightbox().close(); return; }
    const scope = scopeFor(route);
    const image = scope && [...scope.querySelectorAll('img[data-file]')].find(img => img.dataset.file === file || img.dataset.path === file);
    if (!image) return;
    lastScope = scope;
    lightbox().setScope(scope);
    image.scrollIntoView({ block: 'center' });
    attachObserver();
    lightbox().open(image);
  }

  // Keep ?img= in the address bar in step with the lightbox (replaceState: no hashchange, no re-render).
  function attachObserver() {
    const root = document.querySelector('.lb-root');
    if (!root || observer?.root === root) return;
    observer?.disconnect();
    const watcher = new MutationObserver(syncUrlWithLightbox);
    watcher.observe(root, { attributes: true, childList: true, subtree: true, characterData: true });
    observer = watcher;
    observer.root = root;
  }

  function syncUrlWithLightbox() {
    if (!active) return;
    const root = document.querySelector('.lb-root');
    const route = parseGalleryRoute(location.hash);
    const params = new URLSearchParams(route.params);
    if (root?.classList.contains('lb-open')) {
      const [n] = (root.querySelector('.lb-count')?.textContent || '').split('/').map(part => parseInt(part, 10));
      const scope = lastScope;
      const imgs = scope ? [...document.querySelectorAll('img')].filter(img => scope.contains(img)) : [];
      const current = imgs[n - 1];
      if (!current?.dataset.file) return;
      params.set('img', current.dataset.file);
      if (scope.dataset.scopeId && route.view === 'blog') params.set('post', scope.dataset.scopeId);
    } else { params.delete('img'); params.delete('post'); }
    const sub = location.hash.slice(1).split('?')[0].replace(GALLERY_BASE, '').replace(/^\//, '');
    const next = galleryHash(decodeURIComponent(sub), Object.fromEntries(params));
    if (next !== location.hash) history.replaceState(null, '', `${location.pathname}${location.search}${next}`);
  }

  // ------------------------------------------------------------ events

  let lastScope = null;
  async function copy(text, button) {
    try { await navigator.clipboard.writeText(text); } catch {
      const area = document.createElement('textarea');
      area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      area.remove();
    }
    const old = button.textContent;
    button.textContent = 'copied';
    button.classList.add('is-copied');
    setTimeout(() => { button.textContent = old; button.classList.remove('is-copied'); }, 1200);
  }

  page.addEventListener('click', event => {
    const target = event.target;
    const copyButton = target.closest('[data-copy]');
    if (copyButton) { event.preventDefault(); copy(copyButton.dataset.copy, copyButton); return; }
    if (target.closest('[data-refresh]')) { load(true).then(() => render()).catch(() => {}); return; }
    const chip = target.closest('[data-chip]');
    if (chip) {
      if (chip.dataset.chip === 'kind') kind = chip.dataset.value; else branch = chip.dataset.value;
      render();
      return;
    }
    // Navigation links that wrap thumbnails must not be taken over by the lightbox's global image click handler.
    const nav = target.closest('a[href^="#"]');
    if (nav) {
      event.preventDefault(); const href = nav.getAttribute('href');
      if (href.startsWith('#/')) location.hash = href;
      else page.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Image clicks: browse within the nearest scope (a group grid, a post, a compare pane).
    const scope = target.closest('[data-lb-scope]');
    if (target.closest('img, a.g-thumb') && scope) {
      lastScope = scope;
      lightbox()?.setScope(scope);
      queueMicrotask(attachObserver);
      setTimeout(() => { attachObserver(); syncUrlWithLightbox(); }, 0);
    } else if (target.closest('img')) {
      event.preventDefault(); // a thumbnail outside any scope: do not open a one-image lightbox
    }
  });

  page.addEventListener('input', event => {
    if (!event.target.matches('[data-search]')) return;
    query = event.target.value;
    render();
  });

  page.addEventListener('change', event => {
    const input = event.target;
    if (input.matches('[data-cmp]')) {
      const id = input.dataset.cmp;
      compareSel = compareSel.filter(item => item !== id);
      if (input.checked) compareSel.push(id);
      if (compareSel.length > 2) compareSel = compareSel.slice(-2);
      page.querySelectorAll('[data-cmp]').forEach(box => { box.checked = compareSel.includes(box.dataset.cmp); });
      const bar = page.querySelector('[data-compare-bar]');
      bar.hidden = compareSel.length !== 2;
      bar.innerHTML = compareSel.length === 2 ? `<a class="g-btn" href="${hashFor('compare', { a: compareSel[0], b: compareSel[1] })}" data-testid="compare-go">Compare ${esc(compareSel[0])} with ${esc(compareSel[1])}</a>` : '';
      return;
    }
    if (input.matches('[data-cmp-post], [data-cmp-image]')) {
      const params = new URLSearchParams(parseGalleryRoute(location.hash).params);
      const side = input.dataset.cmpPost || input.dataset.cmpImage;
      if (input.dataset.cmpPost) { params.set(side, input.value); params.delete(`${side}i`); } else params.set(`${side}i`, input.value);
      location.hash = galleryHash('compare', Object.fromEntries(params));
    }
  });

  document.addEventListener('keydown', event => {
    if (!active || event.key !== '/' || event.target.closest?.('input, textarea, select')) return;
    const input = page.querySelector('[data-search]');
    if (input) { event.preventDefault(); input.focus(); }
  });

  // ------------------------------------------------------------ lifecycle

  async function activate() {
    active = true;
    host.hidden = false;
    if (!data) page.textContent = 'loading gallery…';
    try {
      await load();
      if (active) render();
    } catch { /* load() already showed the error */ }
  }

  return {
    setActive(on) {
      if (on) { activate(); return; }
      active = false;
      lightbox()?.setScope(null);
      if (document.querySelector('.lb-root.lb-open')) lightbox()?.close();
    },
  };
}
