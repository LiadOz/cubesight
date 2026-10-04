import { test, expect } from 'playwright/test';

const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
for (const [route, ready] of [['drills', '.hub-list'], ['algs', '.alg-case-grid'], ['algs/oll', '.alg-case-grid'], ['algs/f2l?slot=all', '.alg-case-grid']]) {
  test(`main page fits: ${route}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto(`/#/${route}`);
    await page.locator(ready).waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async mode => (await import('/src/theme.js')).setThemePreference(mode), theme);
      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height + 2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 2);
      }
    }
    if (route === 'drills') {
      await expect(page.locator('.hub-hero-stage .orbit')).toBeVisible();
      expect(await page.locator('.hub-hero-stage').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    }
  });
}

test('library paging and search keep every OLL case reachable', async ({ page }) => {
  await page.goto('/#/algs/oll');
  const seen = new Set();
  for (let index = 0; index < 3; index++) {
    await page.locator('.alg-case-grid').waitFor();
    for (const href of await page.locator('.alg-case-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) seen.add(href);
    if (index < 2) {
      await page.getByRole('link', { name: 'next ›', exact: true }).click();
      await expect(page.locator('.alg-pagination')).toContainText(`${index + 2} of 3`);
    }
  }
  expect(seen.size).toBe(57);
  await page.locator('#alg-search').fill('Zamboni');
  await page.locator('[data-alg-search] button').click();
  await expect(page.locator('.alg-case-card')).toHaveCount(1);
  await expect(page.locator('.alg-case-card')).toHaveAttribute('href', '#/algs/oll/2');
  await expect(page.locator('.alg-case-card .orbit')).toBeVisible();
});
