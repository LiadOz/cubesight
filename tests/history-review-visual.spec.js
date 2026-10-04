import { test, expect } from './helpers/coverage-test.js';
import fs from 'node:fs';
import path from 'node:path';
import { seedSolve, visualCell } from './helpers/seed-solve.js';

test.describe.configure({ mode: 'parallel' });

const output = path.resolve('test-results/r1-history-review');
const record = {
  at: 1700000000000, scramble: 'R U', solveMs: 12340, penalty: null,
  focus: 'speed', source: 'smart', solved: true, solveMoves: ["U'", "R'"], moveCount: 2,
};

for (const style of ['orbit', 'mono']) {
  test(`history and review lifecycle: ${style} · all cells`, async ({ page }) => {
    test.setTimeout(60_000);
    await seedSolve(page, { record, style });
    await page.goto('/#/history');
    for (const theme of ['dark', 'light']) {
      for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
        await visualCell(page, { ...viewport, theme });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await page.evaluate(() => { location.hash = '#/history'; });
        const history = page.locator('.history-page');
        await expect(history).toBeVisible();
        await expect(history).toHaveAttribute('data-brain-style', style);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(history.locator('.history-count')).toContainText('1 solves');
        await history.locator('.history-solve a').click();
        await expect(page).toHaveURL(new RegExp(`#\\/history\\/${record.at}$`));
        await expect(history.locator('.history-stage__cube canvas')).toBeVisible();
        await expect(history.locator('.history-results-host .f1-results')).toBeVisible();
        await expect(history.locator('canvas')).toHaveCount(1);
        fs.mkdirSync(output, { recursive: true });
        await page.screenshot({ path: path.join(output, `history-${style}-${theme}-${viewport.name}.png`), fullPage: true });

        // The replay is the history's other screen; there is no separate review page any more.
        await page.evaluate(at => { location.hash = `#/history/${at}/replay`; }, record.at);
        await expect(history).toHaveAttribute('data-view', 'replay');
        await expect(history).toHaveAttribute('data-brain-style', style);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(history.locator('.history-stage__cube canvas')).toBeVisible();
        await expect(history.locator('.history-transport')).toBeVisible();
        await expect(history.locator('canvas')).toHaveCount(1);
        await page.keyboard.press('ArrowRight');
        await expect(history.locator('.history-stage__subline')).toContainText('move 1 of 2');
        await page.screenshot({ path: path.join(output, `replay-${style}-${theme}-${viewport.name}.png`), fullPage: true });

        await page.evaluate(() => { location.hash = '#/history'; });
        await expect(history).toBeVisible();
        await expect(history.locator('canvas')).toHaveCount(1);
        await page.evaluate(at => { location.hash = `#/history/${at}/replay`; }, record.at);
        await expect(history.locator('canvas')).toHaveCount(1);
      }
    }
  });
}
