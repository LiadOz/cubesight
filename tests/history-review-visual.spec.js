import { test, expect } from './helpers/coverage-test.js';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('test-results/r1-history-review');
const record = {
  at: 1700000000000, scramble: 'R U', solveMs: 12340, penalty: null,
  focus: 'speed', source: 'smart', solved: true, solveMoves: ["U'", "R'"], moveCount: 2,
};

for (const style of ['orbit', 'mono']) {
  for (const theme of ['dark', 'light']) {
    for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
      test(`history and review lifecycle: ${style} ${theme} ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.addInitScript(({ record, style, theme }) => {
          localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [record] }));
          localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
          localStorage.setItem('cubesight-theme', theme);
        }, { record, style, theme });

        await page.goto('/#/history');
        const history = page.locator('.history-page');
        await expect(history).toBeVisible();
        await expect(history).toHaveAttribute('data-brain-style', style);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(history.locator('.history-count')).toContainText('1 solves');
        await history.locator('.history-list button').click();
        await expect(history.locator('.history-cube canvas')).toBeVisible();
        await expect(history.locator('.history-playback [data-sequence-position]')).toHaveText('0 / 2');
        await expect(history.locator('canvas')).toHaveCount(1);
        fs.mkdirSync(output, { recursive: true });
        await page.screenshot({ path: path.join(output, `history-${style}-${theme}-${viewport.name}.png`), fullPage: true });

        await page.goto(`/#/review/${record.at}`);
        const review = page.locator('.solve-review-page');
        await expect(review).toBeVisible();
        await expect(review).toHaveAttribute('data-brain-style', style);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(review.locator('.sr-cube canvas')).toBeVisible();
        await expect(review.locator('.sr-player')).toBeVisible();
        await expect(review.locator('canvas')).toHaveCount(1);
        await page.getByRole('button', { name: 'Next move' }).click();
        await expect(review.locator('.sr-step-count')).toHaveText('move 1 / 2');
        await page.screenshot({ path: path.join(output, `review-${style}-${theme}-${viewport.name}.png`), fullPage: true });

        await page.goto('/#/history');
        await expect(history).toBeVisible();
        await expect(history.locator('canvas')).toHaveCount(1);
        await page.goto(`/#/review/${record.at}`);
        await expect(review.locator('canvas')).toHaveCount(1);
      });
    }
  }
}
