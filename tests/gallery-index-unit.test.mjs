import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildGalleryIndex, findUncoveredImages, parseFrontMatter, parseImageId, scanGroups, scanPosts, titleFromFile,
} from '../scripts/gallery-index.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-unit-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content ?? PNG);
  }
  return root;
}

test('image ids come from the file name prefix', () => {
  assert.equal(parseImageId('A-05-results.png'), 'A-05');
  assert.equal(parseImageId('F1-03-results-dark.png'), 'F1-03');
  assert.equal(parseImageId('00-flow-storyboard.svg'), '00');
  assert.equal(parseImageId('C-dark-06-solving.png'), '');
  assert.equal(parseImageId('brain-idea-B.svg'), '');
  assert.equal(parseImageId('T-00-sitemap.png'), 'T-00');
  assert.equal(titleFromFile('A-05-results-dark.png'), 'results dark');
  assert.equal(titleFromFile('brain-idea-B.svg'), 'brain idea B');
});

test('front matter: scalars, comments, inline and block lists', () => {
  const { data, body } = parseFrontMatter(`---
id: orbit-v3            # unique
title: Orbit v3: one Cube + one Orbit
parent: [a, b]
status: chosen
images:
  - A-05-results.png
  - /docs/design/x/*
decision: "Direction A # chosen"
---
Body **here**.
`);
  assert.deepEqual(data, {
    id: 'orbit-v3', title: 'Orbit v3: one Cube + one Orbit', parent: ['a', 'b'], status: 'chosen',
    images: ['A-05-results.png', '/docs/design/x/*'], decision: 'Direction A # chosen',
  });
  assert.equal(body.trim(), 'Body **here**.');
  assert.deepEqual(parseFrontMatter('no front matter').data, {});
});

test('groups: roots, skipped folders, titles, manifests, captions, order, newest first', () => {
  const root = project({
    'docs/design/alpha/A-02-second.png': null,
    'docs/design/alpha/A-01-first.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'docs/design/alpha/_src/ignored.png': null,
    'docs/design/alpha/notes.txt': 'x',
    'docs/design/alpha/index.html': '<title>Alpha gallery</title><p>About alpha.</p><figure><img src="A-02-second.png"><figcaption>A-02 · The second frame</figcaption></figure>',
    'docs/design/beta/sub/B-01-x.png': null,
    'docs/design/beta/manifest.json': JSON.stringify({ title: 'Beta set', description: 'Hand written', order: ['z.png', 'b.png'], 'b.png': { title: 'Bee', id: 'BB-1' } }),
    'docs/design/beta/z.png': null,
    'docs/design/beta/b.png': null,
    'docs/design/beta/a.png': null,
    'gallery/F1-solve/F1-03-results-dark.png': null,
    'node_modules/pkg/x.png': null,
    '.claude/worktrees/w/x.png': null,
    'dist/x.png': null,
  });
  const old = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(path.join(root, 'docs/design/beta/z.png'), old, old);
  for (const name of ['b.png', 'a.png']) fs.utimesSync(path.join(root, 'docs/design/beta', name), old, old);
  const groups = scanGroups(root);
  assert.deepEqual(groups.map(group => group.path).sort(), ['docs/design/alpha', 'docs/design/beta', 'docs/design/beta/sub', 'gallery/F1-solve']);
  const alpha = groups.find(group => group.path === 'docs/design/alpha');
  assert.equal(alpha.title, 'Alpha gallery');
  assert.equal(alpha.description, 'About alpha.');
  assert.equal(alpha.index, '/docs/design/alpha/index.html');
  assert.equal(alpha.kind, 'designs');
  assert.deepEqual(alpha.images.map(image => image.file), ['A-01-first.svg', 'A-02-second.png']);
  assert.equal(alpha.images[1].title, 'The second frame'); // the index.html caption, ID stripped
  assert.equal(alpha.images[0].title, 'first');
  assert.equal(alpha.images[1].id, 'A-02');
  assert.equal(alpha.images[0].path, '/docs/design/alpha/A-01-first.svg');
  assert.ok(alpha.images[0].size > 0 && alpha.images[0].mtime > 0);
  const beta = groups.find(group => group.path === 'docs/design/beta');
  assert.equal(beta.title, 'Beta set');
  assert.equal(beta.description, 'Hand written');
  assert.deepEqual(beta.images.map(image => image.file), ['z.png', 'b.png', 'a.png']);
  assert.equal(beta.images[1].title, 'Bee');
  assert.equal(beta.images[1].id, 'BB-1');
  assert.equal(groups.find(group => group.path === 'docs/design/beta/sub').title, 'beta / sub');
  const shots = groups.find(group => group.path === 'gallery/F1-solve');
  assert.equal(shots.kind, 'screenshots');
  assert.equal(shots.images[0].id, 'F1-03');
  assert.equal(shots.title, 'F1-solve');
  for (let i = 1; i < groups.length; i += 1) assert.ok(groups[i - 1].mtime >= groups[i].mtime, 'newest first');
});

test('a folder of 1,500 images lists quickly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-big-'));
  const dir = path.join(root, 'gallery/big');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 1500; i += 1) fs.writeFileSync(path.join(dir, `X-${String(i).padStart(4, '0')}-shot.png`), PNG);
  const started = performance.now();
  const [group] = scanGroups(root);
  const elapsed = performance.now() - started;
  assert.equal(group.count, 1500);
  assert.equal(group.images[0].file, 'X-0000-shot.png');
  assert.ok(elapsed < 3000, `scan took ${elapsed} ms`);
  const again = performance.now();
  scanGroups(root);
  assert.ok(performance.now() - again < 3000);
});

test('posts: front matter, parents, images relative or by project path, globs, coverage', () => {
  const root = project({
    'docs/design/brain-v2/C-01-idle.png': null,
    'docs/design/brain-v2/C-02-solve.png': null,
    'docs/design/brain-v2/A-01-idle.png': null,
    'gallery/design/2026-09-30-dirs/post.md': `---
id: dirs
title: Directions
date: 2026-09-30
branch: design
status: chosen
images: [/docs/design/brain-v2/C-*, /docs/design/brain-v2/missing.png]
---
# Notes
`,
    'gallery/design/2026-09-30-dirs/own-01-extra.png': null,
    'gallery/solve/2026-10-01-built/post.md': '---\nid: built\ntitle: Built\nbranch: solve\nparent: [dirs, ghost]\nstatus: built\n---\nBody',
    'gallery/solve/2026-10-01-built/F1-01-idle.png': null,
    'gallery/solve/2026-10-01-built/F1-02-x.png': null,
  });
  const { posts, warnings } = scanPosts(root);
  assert.deepEqual(posts.map(post => post.id), ['built', 'dirs']); // newest first
  const dirs = posts.find(post => post.id === 'dirs');
  assert.deepEqual(dirs.images.map(image => image.path), [
    '/docs/design/brain-v2/C-01-idle.png', '/docs/design/brain-v2/C-02-solve.png',
    '/gallery/design/2026-09-30-dirs/own-01-extra.png',
  ]);
  assert.equal(dirs.date, '2026-09-30');
  const built = posts.find(post => post.id === 'built');
  assert.deepEqual(built.parent, ['dirs', 'ghost']);
  assert.equal(built.date, '2026-10-01'); // from the folder name
  assert.deepEqual(built.images.map(image => image.id), ['F1-01', 'F1-02']);
  assert.ok(warnings.some(w => w.includes('missing image')));
  assert.ok(warnings.some(w => w.includes('unknown parent "ghost"')));
  const coverage = findUncoveredImages(root);
  assert.deepEqual(coverage.uncovered, ['docs/design/brain-v2/A-01-idle.png']);
  const index = buildGalleryIndex(root, { now: 1, ttlMs: 0 });
  assert.equal(index.posts.length, 2);
  assert.ok(index.groups.length >= 3);
});
