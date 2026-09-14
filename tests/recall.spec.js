import { test, expect } from 'playwright/test';

async function startRecall(page) {
  await page.clock.install();
  await page.goto('/');
  await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000).toISOString()));
  await page.locator('.training-settings').first().evaluate(el => { el.open = true; });
  await page.getByRole('button', { name: 'One-glance recall', exact: true }).click();
  await page.clock.runFor(20);
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
}

const history = page => page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2') || '{"history":[]}').history);

test('one glimpse, three immediate inputs, no interim reveal or feedback', async ({ page }) => {
  await startRecall(page);
  await expect(page.locator('#glance-toggle')).toBeChecked();
  await expect(page.locator('#glance-toggle')).toBeDisabled();
  await page.keyboard.press('w');
  await expect(page.locator('#case-mode')).toContainText('1/3');
  expect(await history(page)).toHaveLength(0);
  await page.clock.runFor(650);
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'covered');
  await page.keyboard.press('w');
  await expect(page.locator('#case-mode')).toContainText('2/3');
  await expect(page.locator('#cube canvas')).toBeHidden();
  expect(await history(page)).toHaveLength(0);
  await expect(page.locator('#feedback')).not.toContainText(/Correct|Not quite/);
  await page.clock.runFor(150);
  await page.keyboard.press('g');
  await expect(page.locator('#case-mode')).toContainText('3/3');
  await expect(page.locator('#cube canvas')).toBeHidden();
  expect(await history(page)).toHaveLength(0);
  await page.clock.runFor(200);
  await page.keyboard.press('r');
  const results = await history(page);
  expect(results).toHaveLength(3);
  expect(results.map(x => x.position)).toEqual([1, 2, 3]);
  expect(results.map(x => x.mode)).toEqual(['recall', 'recall', 'recall']);
  expect(results[1].ms).toBe(150);
  expect(results[2].ms).toBe(200);
  expect(results.every(x => x.glance && x.exposureMs === 600)).toBe(true);
  await expect(page.locator('#cube canvas')).toBeVisible();
  await expect(page.locator('#feedback')).toContainText('Bottom right:');
  await expect(page.getByRole('button', { name: 'Next cube' })).toBeVisible();
  await page.clock.fastForward(15000);
  await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('timeout discards a partial recall sequence and resume starts fresh', async ({ page }) => {
  await startRecall(page);
  await page.clock.runFor(650);
  await page.keyboard.press('w');
  await page.clock.fastForward(10001);
  await expect(page.locator('#pause-overlay')).toBeVisible();
  expect(await history(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Resume with a fresh case' }).click();
  await expect(page.locator('#case-mode')).toContainText('1/3');
});

test('switching drill during recall cancels its cover timer; controls fit mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await startRecall(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: 'Single corner', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('#glance-toggle')).toBeEnabled();
  await expect(page.locator('#glance-toggle')).not.toBeChecked();
  expect(await history(page)).toHaveLength(0);
});
