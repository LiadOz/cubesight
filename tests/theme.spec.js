import { test, expect, beginCoverage } from './helpers/coverage-test.js';

test('follows system theme until an explicit choice, then remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/drills/corners');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#101820');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme switch preserves the current cube and its sticker colors', async ({ page }) => {
  await page.goto('/#/drills/corners');
  await page.locator('#cube canvas').waitFor();
  const before = await page.locator('#cube canvas').getAttribute('data-camera-pose');
  const swatches = await page.locator('.answer-button > i').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
  await page.locator('#theme-toggle').click();
  await expect(page.locator('#case-number')).toHaveText('case 1');
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-camera-pose', before);
  expect(await page.locator('.answer-button > i').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))).toEqual(swatches);
  await page.goto('/#/drills/f2l');
  await expect(page.locator('#f2l-cube canvas')).toBeVisible();
  await page.getByRole('button', { name: 'help' }).click();
  await expect(page.locator('#help-view')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'one cube, one orbit' })).toBeVisible();
});

test('theme toggle fits and responds to touch on a narrow phone', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  const finishCoverage = await beginCoverage(page, testInfo);
  await page.goto('/#/drills/corners');
  await page.getByRole('button', { name: 'Switch to dark mode' }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await finishCoverage();
  await context.close();
});
