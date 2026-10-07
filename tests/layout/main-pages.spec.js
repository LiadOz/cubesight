import { test, expect } from 'playwright/test';
import { quickRoundSeed } from './fixtures/state-seeds.js';

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

// Each of these once grew past the window at 1280x720 (and Cross Scout grew with the width): the shared Brain
// min-height of 100dvh-60px swelled the quick-round panel, the case head and drill panel stacked, a key label
// carried a 44px touch height inside a 20px bar.
for (const [route, ready] of [['drills/scout', '.cp-session'], ['drills/lookahead', '.lookahead-session'], ['drills/oll', '.oll-stage'],
  ['algs/pll/T', '.alg-case-layout'], ['algs/oll/1', '.alg-case-layout'], ['algs/oll2/eo-line', '.alg-case-layout'], ['algs/pll/Jb/drill', '.alg-drill:not([hidden])']]) {
  test(`one-screen page fits at 1280x720 and above: ${route}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style: 'orbit' })));
    await page.goto(`/#/${route}`);
    await page.locator(ready).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), { message: `${route} at ${width}x${height}` }).toBeLessThanOrEqual(height + 1);
    }
  });
}

test('alg case with the longest case-colour label still fits one screen at 1280x720', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('cubesight-case-color-v1', 'yellow or white'));
  await page.goto('/#/algs/oll/1');
  await page.locator('.alg-case-layout').waitFor();
  await expect(page.locator('.alg-case-display .chip')).toContainText('yellow or white');
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), { message: `${width}x${height}` }).toBeLessThanOrEqual(height + 1);
  }
});

test('corner drill with a round in progress fits one screen', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(seed => localStorage.setItem('cubesight-shell-v1', JSON.stringify(seed)), quickRoundSeed('corners', Date.now()));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/drills/corners');
  await expect(page.locator('.quick-round')).toContainText('1 cases left');
  for (const [width, height] of [[1440, 900], [1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), { message: `${width}x${height}` }).toBeLessThanOrEqual(height + 1);
  }
});

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
