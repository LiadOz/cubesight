import { test, expect } from 'playwright/test';

test.setTimeout(35_000);

async function waitForNextTrial(page, previousCase) {
  await expect(page.locator('#case-number')).not.toHaveText(previousCase, { timeout: 4_000 });
  // A short glance may already be covered by the time the assertion runs.
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
}

async function skipAndWait(page) {
  const previousCase = await page.locator('#case-number').textContent();
  await page.locator('[data-action="skip"]').click();
  await waitForNextTrial(page, previousCase);
}

async function startGlance(page, exposure = '1500') {
  await page.goto('/');
  await page.locator('#exposure-select').selectOption(exposure);
  await page.locator('#glance-toggle').check();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
}

test('Fixed glance never changes after ten skipped outcomes', async ({ page }) => {
  await startGlance(page, '600');
  await page.locator('#exposure-mode').selectOption('fixed');
  await expect(page.locator('#exposure-note')).toContainText('600 ms view');

  for (let i = 0; i < 10; i++) await skipAndWait(page);

  await expect(page.locator('#exposure-select')).toHaveValue('600');
  await expect(page.locator('#exposure-note')).toContainText('fixed pace');
});

test('Adaptive glance eases slower after ten skipped outcomes', async ({ page }) => {
  // 1500 ms is the upper clamp, so use the default 600 ms to make the
  // adaptive slowdown observable.
  await startGlance(page, '600');
  await expect(page.locator('#exposure-mode')).toHaveValue('adaptive');

  for (let i = 0; i < 10; i++) await skipAndWait(page);

  await expect(page.locator('#exposure-select')).toHaveValue('700');
  await expect(page.locator('#exposure-note')).toContainText('Adaptive · 700 ms');
});

test('Changing pacing mode resets adaptive evidence progress', async ({ page }) => {
  await startGlance(page, '1500');
  await page.locator('#exposure-select').selectOption('600');

  for (let i = 0; i < 3; i++) await skipAndWait(page);
  await expect(page.locator('#exposure-note')).toContainText('3/10');

  await page.locator('#exposure-mode').selectOption('fixed');
  await page.locator('#exposure-mode').selectOption('adaptive');
  await expect(page.locator('#exposure-note')).toContainText('0/10');

  for (let i = 0; i < 7; i++) await skipAndWait(page);
  await expect(page.locator('#exposure-select')).toHaveValue('600');
});

test('Changing drill mode resets adaptive evidence progress', async ({ page }) => {
  await startGlance(page, '600');
  for (let i = 0; i < 3; i++) await skipAndWait(page);
  await expect(page.locator('#exposure-note')).toContainText('3/10');

  await page.locator('[data-mode="triple"]').click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
  await page.locator('[data-mode="single"]').click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
  await expect(page.locator('#exposure-note')).toContainText('0/10');
});
