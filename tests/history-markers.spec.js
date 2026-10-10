import { test, expect } from 'playwright/test';
import fs from 'node:fs';
import { seedHistory } from './helpers/history-seed.js';

const record = {
  at: 1000000, scramble: 'R U', solveMs: 30000, source: 'smart', solved: true, focus: 'speed',
  solveMoves: Array.from({ length: 100 }, (_, i) => i % 2 ? 'U' : 'R'), moveCount: 100,
  splits: [{ key: 'cross', label: 'cross', ms: 20000, moves: 80 }, { key: 'pair1', label: 'pair 1', ms: 10000, moves: 20 }],
  analysis: {
    v: 4, engine: 0, face: 'D', solved: true, timed: false,
    marks: { cross: 79, pairs: [99, null, null, null], solved: 99 },
    pauses: Array.from({ length: 8 }, (_, i) => ({ i: i + 5, ms: 1500 + i * 100, allow: 500, boundary: 'cross-f2l' })),
  },
};

test('crowded history critiques stay grouped and open individual reviews with pointer or keyboard', async ({ page }) => {
  await seedHistory(page, { version: 1, records: [record] });
  await page.goto('/#/history/1000000');
  const badge = page.locator('.history-stage .is-cluster').first();
  await expect(badge.locator('.orbit__marker-count')).toHaveText('8');
  await badge.hover();
  await expect(page.locator('.orbit__marker-details-item')).toHaveCount(8);
  await badge.click();
  await expect(page.locator('.orbit__marker-details-item')).toHaveCount(8);
  await page.locator('.orbit__marker-details-close').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await badge.focus();
  await page.keyboard.press('Enter');
  const entries = page.locator('.orbit__marker-details-item');
  await expect(entries).toHaveCount(8);
  await expect(entries.first()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const detailBox = await page.locator('.orbit__marker-details').boundingBox();
  expect(detailBox.x).toBeGreaterThanOrEqual(0);
  expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(390);
  const priorities = await entries.evaluateAll(nodes => nodes.map(node => JSON.parse(node.title).importance));
  expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  expect(priorities[0]).toBeGreaterThan(priorities.at(-1));
  const selectedId = await entries.first().getAttribute('data-marker-detail-key');
  await entries.first().click();
  await expect(page).toHaveURL(/#\/history\/1000000$/);
  await expect(page.locator('.b-rev-detail')).toBeVisible();
  await expect(page.locator(`.b-rev-chip[data-marker="${selectedId}"]`)).toHaveClass(/is-selected/);
});

test('recorded crowded solve keeps stage values clear of badges on phone and desktop', async ({ page }) => {
  const record = JSON.parse(fs.readFileSync(new URL('./fixtures/crowded-review-record.json', import.meta.url), 'utf8'));
  await seedHistory(page, { version: 1, records: [record] });
  await page.goto('/#/history/1000000');
  await expect(page.locator('.history-stage .orbit__marker-cluster')).not.toHaveCount(0);
  for (const pair of [['better-pair-2', 'best-pair-2'], ['best-pair-3', 'efficient-pair-3']]) {
    const selector = `.history-stage [data-marker-keys*="${pair[0]}"][data-marker-keys*="${pair[1]}"]`;
    const cluster = page.locator(selector);
    await expect(cluster).toHaveCount(1);
    await cluster.click();
    for (const key of pair) await expect(page.locator(`[data-marker-detail-key="${key}"]`)).toBeVisible();
    await page.locator('.orbit__marker-details-close').click();
  }
  for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => {
      const labels = [...document.querySelectorAll('.history-stage .orbit__label')];
      const badges = [...document.querySelectorAll('.history-stage .orbit__marker-cluster')];
      return labels.flatMap(label => badges.filter(badge => {
        const a = label.getBoundingClientRect(), b = badge.getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      }).map(badge => `${label.dataset.labelFor}:${badge.dataset.markerKeys}`));
    })).toEqual([]);
    await expect(page.locator('.ui-coach-line__connector')).toHaveClass(/is-linked/);
    await expect.poll(() => page.evaluate(() => {
      const path = document.querySelector('.ui-coach-line__connector path');
      const matrix = path.getScreenCTM(), length = path.getTotalLength();
      const protectedBoxes = [...document.querySelectorAll('.history-stage .orbit__label text, .f1-results__number')].map(node => node.getBoundingClientRect());
      const range = document.createRange(); range.selectNodeContents(document.querySelector('.ui-coach-line__text'));
      const lines = [...range.getClientRects()];
      protectedBoxes.push(...(innerWidth <= 640 ? lines.slice(1) : lines.slice(0, -1)));
      for (let index = 1; index < 150; index++) {
        const p = path.getPointAtLength(length * index / 150);
        const screen = new DOMPoint(p.x, p.y).matrixTransform(matrix);
        const hit = protectedBoxes.find(rect => screen.x > rect.left && screen.x < rect.right && screen.y > rect.top && screen.y < rect.bottom);
        if (hit) return JSON.stringify({ viewport: innerWidth, screen: { x: screen.x, y: screen.y }, hit: hit.toJSON(), path: path.getAttribute('d') });
      }
      return true;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  }
});
