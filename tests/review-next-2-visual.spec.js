import { test, expect } from './helpers/coverage-test.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

for (const style of ['orbit', 'mono']) for (const theme of ['dark', 'light']) for (const width of [1280, 390]) {
  test(`review follow-ups: ${style} ${theme} ${width}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(({ style, theme }) => {
      localStorage.setItem('cubesight-theme', theme);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    }, { style, theme });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const directory = join(process.cwd(), 'test-results/review-next-2-visual');
    await mkdir(directory, { recursive: true });
    const capture = async name => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: join(directory, `${name}-${style}-${theme}-${width}.png`), fullPage: true });
    };

    await page.goto('/#/algs/pll/T');
    const algPage = page.locator('#algs-view .cs-page');
    await expect(algPage).toHaveAttribute('data-brain-style', style);
    await expect(algPage.locator('canvas')).toHaveCount(1);
    await expect(algPage.locator('.alg-cube canvas')).toBeVisible();
    const algCube = await algPage.locator('.alg-cube canvas').boundingBox();
    expect(algCube.width).toBeGreaterThanOrEqual(width === 390 ? 190 : 240);
    await expect(algPage.locator('.sequence-progress')).not.toContainText(/[−-]0\.00/);
    await capture('algs');

    await page.goto('/#/timer');
    const timer = page.locator('#timer-view');
    await expect(timer).toHaveAttribute('data-brain-style', style);
    await expect(timer.locator('canvas')).toHaveCount(1);
    await expect.poll(async () => Number(await timer.locator('.tm-preview-tools').getAttribute('data-sequence-index'))).toBeGreaterThan(0);
    const timerCube = await timer.locator('.tm-preview-cube canvas').boundingBox();
    expect(timerCube.width).toBeGreaterThanOrEqual(width === 390 ? 190 : 240);
    await expect(timer.locator('.sequence-progress')).not.toContainText(/[−-]0\.00/);
    const readyFirst = await timer.locator('.mg-strip').evaluate(strip => {
      const first = strip.firstElementChild;
      const view = strip.getBoundingClientRect(), chip = first.getBoundingClientRect();
      return chip.left >= view.left && chip.right <= view.right && Number(getComputedStyle(first).opacity) >= .9;
    });
    expect(readyFirst).toBe(true);
    // Reset exposes the first complete move, then stepping checks the scroll follows the cue.
    await timer.locator('[data-sequence="reset"]').click();
    const visibleCurrent = async () => timer.locator('.mg-strip').evaluate(strip => {
      const current = strip.querySelector('.current');
      if (!current) return false;
      const view = strip.getBoundingClientRect(), chip = current.getBoundingClientRect();
      return chip.left >= view.left && chip.right <= view.right;
    });
    await expect.poll(visibleCurrent).toBe(true);
    for (let i = 0; i < 10; i++) await timer.locator('[data-sequence="next"]').click();
    await expect.poll(visibleCurrent).toBe(true);
    const scrambleDisplay = await timer.locator('.tm-scramble').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width <= 1 || rect.height <= 1 || getComputedStyle(element).display === 'none';
    });
    expect(scrambleDisplay).toBe(true);
    await capture('timer');

    await page.goto('/#/solve');
    const solve = page.locator('#brain-view .brain');
    await expect(solve).toHaveAttribute('data-brain-style', style);
    if (width === 1280 && style === 'orbit') {
      // The Orbit style has no chip bar (no frame draws one): the config line sits bottom left, A-01.
      await expect(solve.locator('.b-config-line')).toHaveText(/^cfop · .*inspection$/);
      await expect(solve.locator('.b-configbar:visible')).toHaveCount(0);
    } else if (width === 1280) {
      const config = solve.locator('.b-configbar:visible').first();
      await expect(config).toBeVisible();
      const rows = await config.locator('button:visible').evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().top)));
      expect(rows.length).toBeGreaterThan(0);
      expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(2);
      await expect(config.locator('[data-setting="stats.source"]')).toHaveCount(0);
    }
    await capture('solve-idle');

    await page.goto('/#/drills/cross?from=bookmark');
    const missing = page.locator('#not-found-view');
    await expect(missing).toBeVisible();
    await expect(missing).toHaveAttribute('data-brain-style', style);
    await expect(missing).toContainText('not found');
    await expect(page.locator('#brain-view')).toBeHidden();
    await expect(page).toHaveURL(/#\/drills\/cross\?from=bookmark$/);
    await expect(missing.locator('#not-found-drills')).toHaveAttribute('href', '#/drills');
    await expect(missing.locator('#not-found-solve')).toHaveAttribute('href', '#/solve');
    await capture('not-found');
    expect(errors).toEqual([]);
  });
}
