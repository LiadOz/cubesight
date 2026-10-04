import { test, expect } from './helpers/coverage-test.js';

test.setTimeout(35_000);

async function settings(page, open) {
  await page.locator('#exposure-select').evaluate((node, value) => { const panel = node.closest('details'); if (panel) panel.open = value; }, open);
}
async function pacing(page, value) {
  await settings(page, true);
  await page.locator('#exposure-mode').selectOption(value);
  await settings(page, false);
}
async function mode(page, value) {
  await settings(page, true);
  await page.locator(`[data-mode="${value}"]`).click();
  await settings(page, false);
}

const caseSeed = page => page.evaluate(() => window.__cubesightSnapshot?.getViewModel?.()?.viewModel?.currentCase?.seed);

async function waitForNextTrial(page, previousCase) {
  await expect.poll(() => caseSeed(page), { timeout: 4_000 }).not.toBe(previousCase);
  // A short glance may already be covered by the time the assertion runs.
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
}

async function skipAndWait(page) {
  const previousCase = await caseSeed(page);
  await page.locator('[data-action="skip"]').click();
  await page.clock.fastForward(2000);
  await waitForNextTrial(page, previousCase);
}

async function startGlance(page, exposure = '1500') {
  await page.clock.install();
  await page.goto('/#/drills/corners');
  await settings(page, true);
  await page.locator('#exposure-select').selectOption(exposure);
  await page.locator('#glance-toggle').check();
  await settings(page, false);
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
}

test('Fixed glance never changes after ten skipped outcomes', async ({ page }) => {
  await startGlance(page, '600');
  await pacing(page, 'fixed');
  await expect(page.locator('#exposure-note')).toContainText('glance 600 ms · fixed');

  for (let i = 0; i < 10; i++) await skipAndWait(page);

  await expect(page.locator('#exposure-select')).toHaveValue('600');
  await expect(page.locator('#exposure-note')).toContainText('fixed');
});

test('Adaptive glance eases slower after ten skipped outcomes', async ({ page }) => {
  // 1500 ms is the upper clamp, so use the default 600 ms to make the
  // adaptive slowdown observable.
  await startGlance(page, '600');
  await expect(page.locator('#exposure-mode')).toHaveValue('adaptive');

  for (let i = 0; i < 10; i++) await skipAndWait(page);

  await expect(page.locator('#exposure-select')).toHaveValue('700');
  await expect(page.locator('#exposure-note')).toContainText('adaptive glance · 700 ms');
});

test('Changing pacing mode resets adaptive evidence progress', async ({ page }) => {
  await startGlance(page, '1500');
  await settings(page, true);
  await page.locator('#exposure-select').selectOption('600');
  await settings(page, false);

  for (let i = 0; i < 3; i++) await skipAndWait(page);
  await expect(page.locator('#exposure-note')).toContainText('3/10');

  await pacing(page, 'fixed');
  await pacing(page, 'adaptive');
  await expect(page.locator('#exposure-note')).toContainText('0/10');

  for (let i = 0; i < 7; i++) await skipAndWait(page);
  await expect(page.locator('#exposure-select')).toHaveValue('600');
});

test('Changing drill mode resets adaptive evidence progress', async ({ page }) => {
  await startGlance(page, '600');
  for (let i = 0; i < 3; i++) await skipAndWait(page);
  await expect(page.locator('#exposure-note')).toContainText('3/10');

  await mode(page, 'triple');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
  await mode(page, 'single');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', /^(visible|covered)$/, { timeout: 4_000 });
  await expect(page.locator('#exposure-note')).toContainText('0/10');
});
