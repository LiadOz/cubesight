import { test, expect } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// An empty registered worktree keeps this browser check cheap: no checkout, build or cube.
test('dev gallery opens an uncommitted sibling post and serves its own images', async ({ page }) => {
  const git = (...args) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' }).trim();
  const commonDir = path.resolve(git('rev-parse', '--git-common-dir'));
  const artifactRoot = path.join(path.dirname(commonDir), '.agents/artifacts/gallery-worktree-tests');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(artifactRoot, 'draft-'));
  const worktree = path.join(scratch, 'draft');
  git('worktree', 'add', '--detach', '--no-checkout', worktree, 'HEAD');
  try {
    const id = path.basename(scratch);
    const folder = path.join(worktree, 'gallery', id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'post.md'), `---\nid: ${id}\ntitle: Worktree gallery fixture\ndate: 2026-10-10\n---\n![inline preview](GW-01-preview.svg)\n![project preview](/gallery/${id}/GW-01-preview.svg)\n`);
    fs.writeFileSync(path.join(folder, 'GW-01-preview.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#3dbfad"/></svg>');
    await page.goto(`/#/dev/gallery/post/${id}`);
    await expect(page.locator('.g-post > header')).toContainText('Worktree gallery fixture');
    await expect(page.locator('.g-post > header')).toContainText('worktree · draft');
    const image = page.locator('.g-post img').last();
    const src = await image.getAttribute('src');
    expect(src).toMatch(/^\/__gallery-assets\//);
    await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    expect(await page.locator('.g-md img').evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0))).toBe(true);
    const response = await page.request.get(src);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/svg+xml');
    expect(await response.text()).toContain('fill="#3dbfad"');
    await page.locator('[data-refresh]').click();
    await expect(page.locator('.g-post > header')).toContainText('Worktree gallery fixture');
  } finally {
    git('worktree', 'remove', '--force', worktree);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
