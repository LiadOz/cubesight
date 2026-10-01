import { test, expect } from 'playwright/test';

test('algorithm case cold-load, self drill, and IndexedDB history survive offline reload', async ({ page, context }) => {
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
  await page.goto('/#/algs/oll/45');
  await expect(page.getByRole('heading', { name: 'Suit up, T' })).toBeVisible();
  await expect(page.locator('.alg-entry')).toHaveCount(2);
  await page.getByRole('button', { name: 'Start no-cube drill' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(25);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-drill-result]')).toContainText('Recorded');

  const attemptsBeforeReload = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('cubesight-algs', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['attempts'], 'readonly');
      const count = tx.objectStore('attempts').count();
      count.onsuccess = () => resolve(count.result);
      tx.onabort = () => reject(tx.error);
    };
  }));
  expect(attemptsBeforeReload).toBeGreaterThan(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Suit up, T' })).toBeVisible();
  const attemptsAfterReload = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('cubesight-algs', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(['attempts'], 'readonly');
      const count = tx.objectStore('attempts').count();
      count.onsuccess = () => resolve(count.result);
      tx.onabort = () => reject(tx.error);
    };
  }));
  expect(attemptsAfterReload).toBe(attemptsBeforeReload);
  await page.goto('/#/algs/f2l?slot=BL');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(41);
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page).toHaveURL(/#\/algs\/f2l\/1-bl$/);
  await expect(page.locator('[data-alg-cube] canvas')).toHaveCount(1);
  await page.locator('[data-sequence-speed]').selectOption('4');
  await page.locator('[data-sequence="play"]').click();
  await expect.poll(async () => page.locator('[data-sequence-position]').textContent()).toMatch(/^(\d+) \/ \1$/);
  expect(errors).toEqual([]);
});
