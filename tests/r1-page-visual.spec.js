import { test, expect } from 'playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

for (const style of ['orbit', 'mono']) for (const theme of ['dark', 'light']) for (const width of [1280, 390]) {
  test(`shared page cubes in ${style} ${theme} at ${width}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(({ style, theme }) => {
      localStorage.setItem('cubesight-theme', theme);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    }, { style, theme });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    const directory = join(process.cwd(), 'test-results/review-next-visual');
    await mkdir(directory, { recursive: true });
    for (const [name, route, selector] of [
      ['algs', '/algs/pll/T', '#algs-view'],
      ['alg-drill', '/algs/pll/T/drill', '#algs-view'],
      ['hub', '/drills', '#drills-view'],
      ['progress', '/progress', '#progress-view'],
      ['timer', '/timer', '#timer-view'],
      ['oll', '/drills/oll?cases=oll%2F1', '#oll-view'],
      ['pll', '/drills/pll', '#pll-view'],
      ['cross', '/drills/scout?scramble=R%20U%20F2%20L%27&cases=D', '#scout-view'],
      ['lookahead', '/drills/lookahead?cases=17', '#lookahead-view'],
    ]) {
      await page.goto(`/#${route}`);
      const root = page.locator(selector);
      await expect(root).toBeVisible();
      const styledPage = ['pll', 'timer'].includes(name) ? root : root.locator('.cs-page');
      await expect(styledPage).toHaveAttribute('data-brain-style', style);
      await expect(root.locator('canvas')).toHaveCount(1);
      if (name === 'algs') {
        await root.locator('[data-sequence-speed]').selectOption('4');
        await root.locator('[data-sequence="play"]').click();
        await expect(root.locator('[data-case-sequence]')).toHaveAttribute('data-sequence-playing', 'false', { timeout: 15000 });
      }
      if (name === 'alg-drill') {
        await root.locator('[data-action="drill-start"]').click();
        await root.locator('[data-action="drill-done"]').click();
        await expect(root.locator('[data-case-sequence]')).toHaveAttribute('data-sequence-playing', 'false', { timeout: 15000 });
      }
      if (name === 'cross') {
        await expect(root.locator('[data-face="D"]')).toBeEnabled({ timeout: 20000 });
        await root.locator('[data-face="D"]').click();
        await expect(root.locator('#cp-playback')).toBeVisible();
        await expect(root.locator('#cp-playback')).toHaveAttribute('data-sequence-playing', 'false', { timeout: 15000 });
      }
      if (name === 'lookahead') {
        await expect(root.locator('.lookahead-choice').first()).toBeEnabled({ timeout: 20000 });
        await root.locator('.lookahead-choice').first().click();
        await expect(root.locator('#la-playback')).toBeVisible();
        await expect(root.locator('#la-playback')).toHaveAttribute('data-sequence-playing', 'false', { timeout: 15000 });
      }
      await expect(root.locator('canvas')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: join(directory, `${name}-${style}-${theme}-${width}.png`), fullPage: true });
    }
    expect(failures).toEqual([]);
  });
}
