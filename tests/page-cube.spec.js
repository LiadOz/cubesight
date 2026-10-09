import { test, expect } from './helpers/coverage-test.js';

for (const [path, view] of [['/drills', 'drills'], ['/progress', 'progress']]) {
  for (const style of ['orbit', 'mono']) {
    for (const theme of ['dark', 'light']) {
      test(`${view} hero cube mounts once and stays mounted in ${style} / ${theme}`, async ({ page }) => {
        await page.addInitScript(({ mode, pageStyle }) => {
          localStorage.setItem('cubesight-theme', mode);
          localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: pageStyle }));
        }, { mode: theme, pageStyle: style });
        await page.goto(`/#${path}`);
        const pageRoot = page.locator(`#${view}-view .cs-page`);
        await expect(pageRoot).toHaveAttribute('data-brain-style', style);
        const canvas = page.locator(`#${view}-view .${view === 'drills' ? 'hub' : 'progress'}-cube-mount canvas`);
        await expect(canvas).toHaveCount(1);
        const pageCanvases = page.locator(`#${view}-view .cs-page canvas`);
        await expect(pageCanvases).toHaveCount(1);
        await canvas.evaluate(node => { window.__pageHeroCanvas = node; });

        if (view === 'progress') {
          await page.getByRole('combobox', { name: 'solve source', exact: true }).click();
          await page.getByRole('option', { name: 'all solves', exact: true }).click();
          await expect(page.getByRole('combobox', { name: 'solve source', exact: true })).toContainText('all solves');
        }
        else await page.evaluate(() => document.dispatchEvent(new Event('cubesight-theme')));
        expect(await canvas.evaluate(node => node === window.__pageHeroCanvas)).toBe(true);
        await expect(pageCanvases).toHaveCount(1);

        await page.setViewportSize({ width: 390, height: 844 });
        // Poll: the resize reflows asynchronously, so a single read right after setViewportSize raced it (the old flake).
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await expect(pageCanvases).toHaveCount(1);
      });
    }
  }
}
