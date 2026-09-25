import { test, expect } from 'playwright/test';

test('a correct single-corner answer makes the next case ready without a feedback pause', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await page.keyboard.press('g');
  await expect(page.locator('.corner-result')).toContainText('Correct');
  expect(await page.locator('.corner-result').evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    pointerEvents: getComputedStyle(element).pointerEvents,
  }))).toEqual({ animation: 'corner-result-flash', pointerEvents: 'none' });
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(first.correct).toBe(true);
  await page.clock.runFor(50);
  await expect(page.locator('#case-number')).toHaveText('CASE 002');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('#feedback')).toContainText('Correct');
  await page.locator('[data-color="white"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).attempts)).toBe(2);
  await expect(page.locator('.corner-result')).toContainText('Correct · White');
  await page.clock.runFor(50);
  await page.locator('[data-action="skip"]').click();
  await expect(page.locator('.corner-result')).toContainText('Skipped');
});

test('correct three-corner answers accept the next input within one frame', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Three corners', exact: true }).click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000).toISOString()));
  await page.keyboard.press('r');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1).correct)).toBe(true);
  await page.clock.runFor(50);
  await expect(page.locator('#case-mode')).toContainText('2/3');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('.corner-result')).toContainText('Correct');
  await page.keyboard.press('o');
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(second).toMatchObject({ correct: true, position: 2, ms: 50 });
});
