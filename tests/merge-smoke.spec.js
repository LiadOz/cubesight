import { test, expect } from './helpers/coverage-test.js';
import { mountFakeCube, startScramble, completeScramble, solveReverse } from './layout/fake-cube.js';

test.use({ reducedMotion: 'reduce' });

test('connected cube reaches scramble, inspection and live results', async ({ page }) => {
  await mountFakeCube(page);
  await expect.poll(() => page.evaluate(() => window.testBrain.handle.getViewModel()?.screen)).toBe('idle');
  const scramble = await startScramble(page, 'R U');
  await completeScramble(page, scramble);
  await expect(page.locator('#brain-phase-label')).toContainText('inspection');
  await solveReverse(page, scramble);
  await expect(page.locator('#brain-phase-label')).toHaveText('solved');
  await expect(page.locator('#brain-view .orbit')).toBeVisible();
  await expect(page.locator('#brain-cube canvas')).toHaveCount(1);
});

test('routes, redirect and both visual styles render', async ({ page }) => {
  await page.goto('/?source=smoke#/brain?mode=guided');
  await expect(page).toHaveURL(/\?source=smoke#\/solve\?mode=guided$/);
  await expect(page.locator('#brain-view')).toBeVisible();
  for (const [route, ready] of [['drills','.hub-list'],['algs','.alg-case-grid'],['progress','.progress-page'],['history','.history-page']]) {
    await page.evaluate(route => { location.hash = '#/'+route; }, route);
    await expect(page.locator(ready)).toBeVisible();
  }
  for (const style of ['orbit','mono']) {
    await page.goto(`/src/brain/_gallery.html?cube=stub&style=${style}&fx=solving&theme=dark`);
    await expect(page.locator('html')).toHaveAttribute('data-gallery-ready','true');
    await expect(page.locator('.brain')).toHaveAttribute('data-brain-style',style);
    await expect(page.locator('#brain-cube canvas')).toHaveCount(1);
    await expect(page.locator('.b-clock')).toBeVisible();
  }
});
