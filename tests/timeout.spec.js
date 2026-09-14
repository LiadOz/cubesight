import { test, expect } from 'playwright/test';

const savedProgress = page => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'cubesight-theme')));

test('ten-second corner trials pause without logging or changing adaptive pace', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.locator('#glance-toggle').check();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  const before = await savedProgress(page);
  await page.clock.fastForward(10_001);
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await expect(page.locator('#pause-overlay')).toContainText('This trial was not recorded');
  await page.keyboard.press('w');
  expect(await savedProgress(page)).toEqual(before);
  await expect(page.locator('#exposure-select')).toHaveValue('600');
  await page.getByRole('button', { name: 'Resume with a fresh case' }).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#case-number')).toHaveText('CASE 001');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('#exposure-note')).toContainText('0/10');
});

test('answers under ten seconds are still recorded', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await page.clock.fastForward(8_000);
  await page.keyboard.press('w');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'feedback');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).attempts)).toBe(1);
});

test('late input is rejected even before a delayed timeout callback runs', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  const before = await savedProgress(page);
  await page.evaluate(() => {
    const originalNow = performance.now.bind(performance);
    performance.now = () => originalNow() + 10_001;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
  });
  await expect(page.locator('#pause-overlay')).toBeVisible();
  expect(await savedProgress(page)).toEqual(before);
});

test('F2L search has no ten-second cutoff', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('link', { name: 'F2L deduction' }).click();
  await expect(page.locator('#f2l-cube canvas')).toBeVisible();
  const before = await savedProgress(page);
  const previousCase = await page.locator('#f2l-case-number').textContent();
  await page.clock.fastForward(30_000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
  expect(await savedProgress(page)).toEqual(before);
  await expect(page.locator('#f2l-case-number')).toHaveText(previousCase);
  await expect(page.locator('#f2l-found')).toHaveText('0');
  await expect(page.locator('#f2l-timings')).toContainText('Find a pair');
});

test('break prompt is confined to the cube and does not block switching to F2L', async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await page.clock.fastForward(10_001);
  const prompt = page.locator('#pause-overlay');
  await expect(prompt).toBeVisible();
  const stage = await page.locator('#corner-view .cube-stage').boundingBox();
  const box = await prompt.boundingBox();
  expect(box.x).toBeCloseTo(stage.x, 0);
  expect(box.y).toBeCloseTo(stage.y, 0);
  expect(box.width).toBeCloseTo(stage.width, 0);
  expect(box.height).toBeCloseTo(stage.height, 0);
  const resume = await prompt.getByRole('button').boundingBox();
  expect(resume.y + resume.height).toBeLessThanOrEqual(box.y + box.height);
  await page.locator('#theme-toggle').click();
  await page.getByRole('link', { name: 'F2L deduction' }).click();
  await expect(prompt).toBeHidden();
  await expect(page.locator('#f2l-cube canvas')).toBeVisible();
  await page.clock.fastForward(30_000);
  await expect(prompt).toBeHidden();
});
