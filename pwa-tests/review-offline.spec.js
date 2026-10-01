import { test, expect } from 'playwright/test';

test('review import, solve replay, and retry routes work offline after install', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });

  await context.setOffline(true);
  await page.goto('/#/review/import');
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+$/);
  await expect(page.locator('.sr-cube canvas')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sr-step-count')).toHaveText('move 1 / 2');
  await page.getByRole('button', { name: 'Retry this moment' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+\/retry\?move=1$/);
  await expect(page.locator('.sr-retry-cube canvas')).toBeVisible();
  await page.locator('.sr-virtual-pad button').filter({ hasText: 'R′' }).click();
  await expect(page.locator('.sr-grade')).toContainText('Clean retry');
  await expect(page.locator('.sr-regrade')).toContainText('Shared engine regrade');
  expect(errors).toEqual([]);
});
