import { test, expect } from 'playwright/test';

test('drills and progress cold routes load their 3D cube while offline', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/#/solve');
  await page.evaluate(async () => { await navigator.serviceWorker?.ready; return true; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto('/#/drills');
  await expect(page.locator('#drills-view .hub-cube-mount canvas')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#drills-view .hub-row')).toHaveCount(6);
  await page.goto('/#/progress');
  await expect(page.locator('#progress-view .progress-cube-mount canvas')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('#progress-view h1')).toHaveText('progress');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await context.close();
});
