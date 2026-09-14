import { test, expect } from 'playwright/test';

async function seed(page) {
  await page.addInitScript(() => {
    const family = 'green-red-white';
    const detail = { family, target: 'UFL', visible: ['green', 'red'], missing: 'white', mode: 'single', position: 1, glance: false };
    const history = [
      ...[100, 200, 300].map((ms, i) => ({ ...detail, correct: true, ms, selected: 'white', at: 1000 + i })),
      { ...detail, correct: false, ms: 480, selected: 'blue', at: 1004 },
      { family: 'blue-orange-yellow', correct: true, ms: 900, at: 1005 },
      { ...detail, correct: true, ms: 10000, at: 1006 },
      { ...detail, mode: 'triple', position: 2, correct: true, ms: 1500, at: 1007 },
    ];
    localStorage.setItem('cubesight-progress-v2', JSON.stringify({ history }));
  });
  await page.goto('/#/corners');
}

test('piece and drill filters show correct-only times and specific color confusions', async ({ page }) => {
  await seed(page);
  await page.getByRole('combobox', { name: 'Filter by corner piece' }).selectOption('green-red-white');
  await page.getByRole('combobox', { name: 'Filter by drill mode' }).selectOption('single');
  await expect(page.locator('.rp-count')).toHaveText('3');
  await expect(page.locator('.rp-median')).toHaveText('200ms');
  await expect(page.locator('.rp-p90')).toHaveText('300ms');
  await page.getByRole('button', { name: 'Show entries' }).click();
  await expect(page.locator('.rp-trend-point')).toHaveCount(3);
  await expect(page.locator('.rp-rows')).toContainText('UFL');
  await expect(page.locator('.rp-rows')).toContainText('white');
  await expect(page.locator('.rp-rows')).toContainText('blue (1)');
  await page.getByRole('combobox', { name: 'Filter by drill mode' }).selectOption('triple');
  await expect(page.locator('.rp-count')).toHaveText('1');
  await expect(page.locator('.rp-trend-point')).toHaveCount(1);
  await expect(page.locator('.rp-note')).toContainText('feedback');
  await page.getByRole('combobox', { name: 'Filter by viewing mode' }).selectOption('glance');
  await expect(page.locator('.rp-count')).toHaveText('0');
  await expect(page.locator('.rp-trend-empty')).toBeVisible();
});

test('old history remains usable, and clearing history resets the profile', async ({ page }) => {
  await seed(page);
  await page.getByRole('combobox', { name: 'Filter by corner piece' }).selectOption('blue-orange-yellow');
  await expect(page.locator('.rp-count')).toHaveText('1');
  await expect(page.locator('.rp-note')).toContainText(/older|detail/i);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear history' }).click();
  await expect(page.locator('.rp-count')).toHaveText('0');
  await expect(page.locator('.rp-trend-empty')).toBeVisible();
});

test('profile fits a narrow phone in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await seed(page);
  await page.locator('#recognition-profile').scrollIntoViewIfNeeded();
  await expect(page.locator('.rp-trend-chart')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
