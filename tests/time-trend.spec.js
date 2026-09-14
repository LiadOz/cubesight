import { test, expect } from 'playwright/test';

async function seed(page) {
  await page.addInitScript(() => {
    const now = Date.now();
    const history = [10, 9, 1].map((days, index) => ({
      at: now - days * 86400000, ms: [500, 400, 200][index], correct: true,
      family: 'green-red-white', mode: index === 2 ? 'recall' : 'single', glance: index === 2,
    }));
    history.push({ at: now - 10 * 86400000 + 5, ms: 100, correct: false, family: 'green-red-white', mode: 'single' });
    localStorage.setItem('cubesight-progress-v2', JSON.stringify({ history }));
  });
  await page.goto('/');
}

test('trend uses actual date gaps, aligned attempt dots, and inspectable points', async ({ page }) => {
  await seed(page);
  await page.getByRole('combobox', { name: 'Group trend by' }).selectOption('day');
  await page.getByRole('button', { name: 'Show entries' }).click();
  await expect(page.locator('.rp-trend-point')).toHaveCount(3);
  const positions = await page.locator('.rp-trend-point').evaluateAll(points => points.map(p => +p.getAttribute('cx')));
  expect((positions[1] - positions[0]) / (positions[2] - positions[0])).toBeCloseTo(1 / 9, 4);
  const attempts = await page.locator('.rp-entry-point').evaluateAll(points => points.map(p => +p.getAttribute('cx')));
  expect(attempts).toEqual(positions);
  await page.locator('.rp-trend-point').first().click();
  await expect(page.locator('.rp-trend-readout')).toContainText('1/2 correct');
  await expect(page.locator('.rp-trend-readout')).toContainText('median 500ms');
  await page.getByRole('combobox', { name: 'Filter trend period' }).selectOption('7days');
  await expect(page.locator('.rp-count')).toHaveText('1');
  await expect(page.locator('.rp-median')).toHaveText('200ms');
  await expect(page.locator('.rp-trend-point')).toHaveCount(1);
  await expect(page.locator('.rp-trend-row')).toContainText('median 200ms');
  await page.getByRole('combobox', { name: 'Filter trend period' }).selectOption('today');
  await expect(page.locator('.rp-trend-empty')).toBeVisible();
});

test('recall filter survives mobile resizing and session breakdown shows dates', async ({ page }) => {
  await seed(page);
  await page.getByRole('combobox', { name: 'Filter by drill mode' }).selectOption('recall');
  await page.getByRole('button', { name: 'Show entries' }).click();
  await expect(page.locator('.rp-trend-point')).toHaveCount(1);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('combobox', { name: 'Group trend by' }).selectOption('session');
  await page.locator('.rp-time-breakdown summary').click();
  await expect(page.locator('.rp-trend-row')).toHaveCount(1);
  await expect(page.locator('.rp-trend-readout')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await expect(page.locator('.rp-note')).toContainText('includes the initial glance');
});

test('one merged piece graph defaults to numbered attempts and draws a rolling trend line', async ({ page }) => {
  await seed(page);
  await expect(page.locator('#recognition-profile svg')).toHaveCount(1);
  await expect(page.getByRole('combobox', { name: 'Group trend by' })).toHaveValue('attempt');
  await expect(page.locator('.rp-axis-label').first()).toHaveText('1');
  await expect(page.locator('.rp-time-label')).toHaveCount(0);
  await expect(page.locator('.rp-rolling-line')).toHaveCount(1);
  await expect(page.locator('.rp-trend-note')).toContainText('Rolling trend ends');
  await expect(page.getByRole('button', { name: 'Show entries' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rp-trend-point')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show entries' }).click();
  const positions = await page.locator('.rp-trend-point').evaluateAll(points => points.map(p => +p.getAttribute('cx')));
  expect(positions[1] - positions[0]).toBeCloseTo(positions[2] - positions[1], 5);
  await page.locator('.rp-trend-point').first().click();
  await expect(page.locator('.rp-trend-readout')).toContainText('Attempt 1: 500ms');
  await page.getByRole('button', { name: 'Hide entries' }).click();
  await expect(page.locator('.rp-trend-point')).toHaveCount(0);
  await expect(page.locator('.rp-rolling-line')).toHaveCount(1);
});

test('a slow outlier is pinned without flattening the useful timing range', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem('cubesight-progress-v2', JSON.stringify({ history: [300, 350, 400, 9000].map((ms, index) => ({
      at: now + index, ms, correct: true, family: 'green-red-white', mode: 'single', glance: false,
    })) }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Show entries' }).click();
  await expect(page.locator('.rp-trend-note')).toContainText('chart ceiling is 500 ms');
  const ys = await page.locator('.rp-trend-point').evaluateAll(points => points.map(point => +point.getAttribute('cy')));
  expect(ys[0] - ys[2]).toBeGreaterThan(30);
  expect(ys[3]).toBeLessThanOrEqual(20);
});
