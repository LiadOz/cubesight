import { test, expect } from 'playwright/test';

test('follows system theme until an explicit choice, then remembers it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
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
  await page.goto('/');
  await page.locator('#cube canvas').waitFor();
  const before = await page.locator('#cube canvas').getAttribute('data-camera-pose');
  const swatches = await page.locator('.answer-button > i').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
  await page.locator('#theme-toggle').click();
  await expect(page.locator('#case-number')).toHaveText('CASE 001');
  await expect(page.locator('#cube canvas')).toHaveAttribute('data-camera-pose', before);
  expect(await page.locator('.answer-button > i').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))).toEqual(swatches);
  await page.getByRole('link', { name: 'F2L deduction' }).click();
  await expect(page.locator('#f2l-cube canvas')).toBeVisible();
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.locator('#help-dialog')).toHaveCSS('background-color', 'rgb(25, 36, 47)');
});

test('theme toggle fits and responds to touch on a narrow phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark mode' }).tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await context.close();
});
