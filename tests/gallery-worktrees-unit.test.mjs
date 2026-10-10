import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildWorktreeGalleryIndex, galleryWorktrees, resolveWorktreeGalleryAsset } from '../scripts/gallery-worktrees.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-worktrees-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, text) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}
function post(root, id, extra = '') {
  write(root, `gallery/${id}/post.md`, `---\nid: ${id}\ntitle: ${id}\ndate: 2026-10-10\n${extra}---\n![preview](GW-01.svg)`);
  return write(root, `gallery/${id}/GW-01.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
}

test('gallery combines uncommitted worktree posts once and preserves their own image origins', t => {
  const root = fixture(t), local = path.join(root, 'local'), other = path.join(root, 'other');
  post(local, 'approved');
  post(other, 'approved');
  post(other, 'proposal', 'parent: approved\nimages: [/docs/design/new/GW-02.svg, /tests/screens.spec.js-snapshots/GW-03.png]\n');
  write(other, 'docs/design/new/GW-02.svg', '<svg/>');
  write(other, 'tests/screens.spec.js-snapshots/GW-03.png', 'image');
  const index = buildWorktreeGalleryIndex(local, { worktrees: [local, other], ttlMs: 0 });
  assert.deepEqual(index.posts.map(p => p.id).sort(), ['approved', 'proposal']);
  assert.deepEqual(index.warnings, []);
  assert.equal(index.posts.find(p => p.id === 'approved').worktree, undefined);
  const proposal = index.posts.find(p => p.id === 'proposal');
  assert.equal(proposal.worktree, 'other');
  assert.match(proposal.base, /^\/__gallery-assets\/[a-f0-9]+\/gallery\/proposal\/$/);
  assert.equal(proposal.images.length, 3);
  for (const image of proposal.images) {
    const requestUrl = image.path.replace('/__gallery-assets', '');
    assert.equal(resolveWorktreeGalleryAsset(local, requestUrl, [local, other]), path.join(other, decodeURIComponent(image.path.slice(proposal.assetBase.length))));
  }
  assert.equal(index.groups.filter(group => group.worktree).length, 1, 'inherited folders are not duplicated');
  const group = index.groups.find(g => g.worktree);
  assert.ok(proposal.images.some(image => image.path.startsWith(group.imageBase)));
  post(other, 'later');
  const refreshed = buildWorktreeGalleryIndex(local, { worktrees: [local, other], ttlMs: 0 });
  assert.ok(refreshed.posts.some(p => p.id === 'later'), 'refresh discovers new uncommitted posts');
  fs.rmSync(path.join(other, 'gallery/later'), { recursive: true });
  assert.ok(!buildWorktreeGalleryIndex(local, { worktrees: [local, other], ttlMs: 0 }).posts.some(p => p.id === 'later'));
});

test('worktree asset serving rejects traversal, unrelated files, unknown worktrees and escaping symlinks', t => {
  const root = fixture(t), local = path.join(root, 'local'), other = path.join(root, 'other');
  post(local, 'local');
  const image = post(other, 'proposal');
  const index = buildWorktreeGalleryIndex(local, { worktrees: [other], ttlMs: 0 });
  const prefix = index.posts.find(p => p.id === 'proposal').assetBase.replace('/__gallery-assets', '');
  const resolve = suffix => resolveWorktreeGalleryAsset(local, prefix + suffix, [local, other]);
  assert.equal(resolve('/gallery/proposal/GW-01.svg?version=1'), image);
  write(other, 'private.txt', 'private');
  fs.symlinkSync(path.join(other, 'private.txt'), path.join(other, 'gallery/proposal/escape.svg'));
  for (const suffix of ['/private.txt', '/gallery/../private.txt', '/gallery/%2e%2e/private.txt', '/gallery/proposal/escape.svg', '/gallery/%5c../private.txt', '/gallery/%ZZ', '/src/main.js']) assert.equal(resolve(suffix), null, suffix);
  assert.equal(resolveWorktreeGalleryAsset(local, '/unknown/gallery/proposal/GW-01.svg', [other]), null);
  assert.equal(resolveWorktreeGalleryAsset(local, prefix + '/gallery/proposal/GW-01.svg', [local]), null);
});

test('discovery follows registered Git worktrees and excludes merge-queue scratch checkouts', t => {
  const root = fixture(t), repo = path.join(root, 'repo'), other = path.join(root, 'other');
  fs.mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' });
  git('init', '-b', 'main');
  git('-c', 'user.name=gallery test', '-c', 'user.email=gallery@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
  git('worktree', 'add', '-b', 'proposal', other);
  git('worktree', 'add', '--detach', path.join(root, 'merge-queue', 'scratch'));
  assert.deepEqual(galleryWorktrees(repo), [repo, other]);
  assert.deepEqual(galleryWorktrees(other), [other, repo]);
  post(other, 'registered');
  assert.ok(buildWorktreeGalleryIndex(repo, { ttlMs: 0 }).posts.some(p => p.id === 'registered'));
});
