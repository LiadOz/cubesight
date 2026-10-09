import { test, expect } from './helpers/coverage-test.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('test-results/review-next-2-site');

test.setTimeout(60_000);
// One test per style x theme x viewport cell (they were one 8-cell loop): the cells are independent, so they run in parallel.
for (const style of ['orbit', 'mono']) {
  for (const theme of ['light', 'dark']) {
    for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
      test(`solve settings stay on one desktop line and unknown routes have a styled recovery page: ${style} / ${theme} / ${viewport.name}`, async ({ page }) => {
        await mkdir(output, { recursive: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/#/solve');
        await page.evaluate(({ themeMode, brainStyle }) => {
          localStorage.setItem('cubesight-theme', themeMode);
          localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: brainStyle, stats: { source: 'manual' } }));
        }, { themeMode: theme, brainStyle: style });
        await page.reload();
        const brain = page.locator('#brain-view .brain');
        await expect(brain).toHaveAttribute('data-brain-style', style);
        const quickBar = page.locator('#brain-view .brain > .b-configbar');
        await expect(quickBar.locator('[data-setting="stats.source"]')).toHaveCount(0);
        await expect(page.locator('#brain-view [data-setting="stats.source"]')).toHaveCount(3);
        if (viewport.name === 'desktop') {
          const rowTops = await quickBar.locator('button:visible').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
          expect(Math.max(...rowTops) - Math.min(...rowTops)).toBeLessThan(3);
        } else {
          const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
        }
        await page.screenshot({ path: path.join(output, `solve-${style}-${theme}-${viewport.name}.png`), fullPage: true });

        // The relocated source choice remains available and persists in settings.
        await page.locator('#brain-view .brain-pill-setup > summary').click();
        const allSource = page.locator('#brain-view [data-setting="stats.source"][data-value="all"]');
        await expect(allSource).toBeVisible();
        await allSource.click();
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).stats.source)).toBe('all');
        const smartSource = page.locator('#brain-view [data-setting="stats.source"][data-value="smart"]');
        await smartSource.click();
        await expect(smartSource).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).stats.source)).toBe('smart');

        await page.reload();
        await page.locator('#brain-view .brain-pill-setup > summary').click();
        await expect(page.locator('#brain-view [data-setting="stats.source"][data-value="smart"]')).toHaveAttribute('aria-pressed', 'true');

        await page.goto('/#/drills/cross?from=matrix');
        const missing = page.locator('#not-found-view');
        await expect(missing).toBeVisible();
        await expect(missing).toHaveAttribute('data-brain-style', style);
        await expect(missing.getByRole('heading', { name: 'not found' })).toBeVisible();
        await expect(page).toHaveURL(/#\/drills\/cross\?from=matrix$/);
        await expect(missing.locator('#not-found-drills')).toHaveAttribute('href', '#/drills');
        await expect(missing.locator('#not-found-solve')).toHaveAttribute('href', '#/solve');
        if (viewport.name === 'phone') {
          const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
        }
        await page.screenshot({ path: path.join(output, `not-found-${style}-${theme}-${viewport.name}.png`), fullPage: true });
        await missing.locator('#not-found-drills').click();
        await expect(page).toHaveURL(/#\/drills$/);
        await expect(page.locator('#drills-view')).toBeVisible();
      });
    }
  }
}
