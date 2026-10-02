import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderInline } from '../src/dev/gallery-markdown.js';
import { filterGroups, galleryHash, layoutTimeline, matchesQuery, orderPosts, parseGalleryRoute, searchImages } from '../src/dev/gallery-model.js';
import { resolveRoute, registerDevRoute } from '../src/routes.js';

test('gallery routes parse and round trip', () => {
  assert.equal(parseGalleryRoute('#/dev/gallery').view, 'folders');
  assert.equal(parseGalleryRoute('#/dev/gallery/blog').view, 'blog');
  assert.equal(parseGalleryRoute('#/dev/gallery/timeline').view, 'timeline');
  const post = parseGalleryRoute('#/dev/gallery/post/orbit-v3?img=A-05.png');
  assert.deepEqual([post.view, post.id, post.params.get('img')], ['post', 'orbit-v3', 'A-05.png']);
  const group = parseGalleryRoute('#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png');
  assert.deepEqual([group.view, group.group, group.params.get('img')], ['group', 'docs/design/orbit-v3', 'A-05-results.png']);
  assert.equal(parseGalleryRoute('#/dev/gallery/compare?a=x&b=y').params.get('b'), 'y');
  assert.equal(galleryHash('docs/design/orbit-v3', { img: 'A-05-results.png' }), '#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png');
  assert.equal(galleryHash(''), '#/dev/gallery');
});

test('the gallery route resolves only once a dev route is registered', () => {
  assert.equal(resolveRoute('#/dev/gallery').tool, 'notfound');
  registerDevRoute({ tool: 'gallery', match: path => /^\/dev\/gallery(?:\/.*)?$/.test(path) });
  const r = resolveRoute('#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png');
  assert.equal(r.tool, 'gallery');
  assert.equal(r.hash, '#/dev/gallery/docs/design/orbit-v3?img=A-05-results.png');
});

test('search and filters', () => {
  const groups = [
    { path: 'docs/design/orbit-v3', title: 'Orbit v3', description: '', kind: 'designs', mtime: 5, count: 1, images: [{ file: 'A-05-results.png', title: 'results', id: 'A-05', caption: '' }] },
    { path: 'gallery/F1', title: 'F1', description: '', kind: 'screenshots', mtime: 9, count: 1, images: [{ file: 'F1-01-idle.png', title: 'idle', id: 'F1-01', caption: '' }] },
  ];
  assert.deepEqual(filterGroups(groups).map(g => g.path), ['gallery/F1', 'docs/design/orbit-v3']);
  assert.deepEqual(filterGroups(groups, { kind: 'designs' }).map(g => g.path), ['docs/design/orbit-v3']);
  assert.deepEqual(filterGroups(groups, { query: 'results' }).map(g => g.path), ['docs/design/orbit-v3']);
  assert.equal(searchImages(groups, 'idle f1').length, 1);
  assert.equal(searchImages(groups, 'idle', 'designs').length, 0);
  assert.ok(matchesQuery('', 'anything'));
});

test('markdown is safe and handles the basics', () => {
  const html = renderMarkdown('# Title\n\nSome **bold**, *italic* and `code <b>`.\n\n1. one\n2. two\n\n- a\n- b\n\n![shot](A-05.png) [x](javascript:alert(1)) [ok](https://example.com)\n\n<script>alert(1)</script>', name => (/^https?:/.test(name) ? name : `/base/${name}`));
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code &lt;b&gt;<\/code>/);
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<img src="\/base\/A-05\.png" alt="shot"/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /href="https:\/\/example\.com" target="_blank"/);
  assert.equal(renderInline('a < b'), 'a &lt; b');
});

test('timeline: lanes by branch, children before parents, edges for branch and merge', () => {
  const posts = [
    { id: 'root', branch: 'design', date: '2026-09-29', parent: [] },
    { id: 'a', branch: 'mono', date: '2026-09-30', parent: ['root'] },
    { id: 'c', branch: 'orbit', date: '2026-09-30', parent: ['root'] },
    { id: 'merge', branch: 'design', date: '2026-09-30', parent: ['a', 'c'] },
    { id: 'later', branch: 'orbit', date: '2026-10-01', parent: ['merge'] },
  ];
  const ordered = orderPosts(posts).map(post => post.id);
  assert.equal(ordered[0], 'later');
  assert.equal(ordered.at(-1), 'root');
  assert.ok(ordered.indexOf('merge') < ordered.indexOf('a') && ordered.indexOf('merge') < ordered.indexOf('c'));
  const layout = layoutTimeline(posts);
  assert.deepEqual(layout.branches, ['design', 'mono', 'orbit']);
  assert.equal(layout.edges.length, 5);
  const row = id => layout.rows.find(item => item.post.id === id);
  assert.equal(row('root').lane, 0);
  assert.equal(row('later').lane, 2);
  // merge (lane 0) has two parents on other lanes: two curves
  assert.equal(row('merge').segments.filter(segment => segment.kind === 'curve').length, 2);
  // root receives children: 'up' segments from each of its children's edges
  assert.equal(row('root').segments.filter(segment => segment.kind === 'up').length, 2);
  // a parent two rows away is passed through by a vertical line
  const gaps = layout.rows.flatMap(item => item.segments).filter(segment => segment.kind === 'through');
  assert.ok(gaps.length >= 1);
  // a cycle in the data cannot hang the layout
  assert.equal(layoutTimeline([{ id: 'x', branch: 'b', date: '2026-01-01', parent: ['y'] }, { id: 'y', branch: 'b', date: '2026-01-01', parent: ['x'] }]).rows.length, 2);
});
