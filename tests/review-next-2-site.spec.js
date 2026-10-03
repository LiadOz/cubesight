import { test, expect } from './helpers/coverage-test.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('test-results/review-next-2-site');

test.setTimeout(120_000);
test('solve settings stay on one desktop line and unknown routes have a styled recovery page', async ({ page }) => {
  await mkdir(output, { recursive: true });
  for (const style of ['orbit', 'mono']) {
    for (const theme of ['light', 'dark']) {
      for (const viewport of [{ name: 'desktop', width: 1280, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
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
        await expect(page.locator('#brain-view .b-results-source select')).toHaveCount(1);
        if (viewport.name === 'desktop') {
          const rowTops = await quickBar.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
          expect(Math.max(...rowTops) - Math.min(...rowTops)).toBeLessThan(3);
        } else {
          const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
          expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
        }
        await page.screenshot({ path: path.join(output, `solve-${style}-${theme}-${viewport.name}.png`), fullPage: true });

        // The relocated source choice remains available and persists in settings.
        await page.locator('#brain-view .brain-pill-setup').evaluate(details => { details.open = true; });
        const allSource = page.locator('#brain-view [data-setting="stats.source"][data-value="all"]');
        await expect(allSource).toBeVisible();
        await allSource.click();
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).stats.source)).toBe('all');
        await page.locator('#brain-view #brain-review').evaluate(review => { review.hidden = false; });
        await page.locator('#brain-results-source').selectOption('smart');
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-brain-settings-v2')).stats.source)).toBe('smart');

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
      }
    }
  }
});
