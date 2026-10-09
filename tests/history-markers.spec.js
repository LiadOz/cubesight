import { test, expect } from 'playwright/test';
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
  await entries.first().click();
  await expect(page).toHaveURL(/review\/pause-5/);
});
