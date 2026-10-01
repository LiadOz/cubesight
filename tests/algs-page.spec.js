import { test, expect } from 'playwright/test';

test('curated OLL case page shows verified sources, setup repaint, picked alg and no-cube drill', async ({ page }) => {
  await page.goto('/#/algs/oll');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(57);
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page).toHaveURL(/#\/algs\/oll\/1$/);
  await expect(page.getByRole('heading', { name: 'Runway, Blank' })).toBeVisible();
  await expect(page.locator('[data-alg-cube] canvas')).toBeVisible();
  await expect(page.locator('.alg-entry')).toHaveCount(2);
  await expect(page.locator('.alg-entry a').first()).toHaveAttribute('href', /speedsolving\.com/);
  await page.locator('[data-pick]').last().click();
  await expect(page.locator('.alg-entry.is-picked')).toHaveCount(1);
  await page.getByRole('button', { name: 'Start no-cube drill' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-drill-result]')).toContainText('Recorded');
});

test('case drill deep link is preserved and opens the requested case', async ({ page }) => {
  await page.goto('/#/algs/pll/Jb/drill');
  await expect(page).toHaveURL(/#\/algs\/pll\/Jb\/drill$/);
  await expect(page.getByRole('heading', { name: 'Jb' })).toBeVisible();
  await expect(page.locator('[data-drill]')).toBeVisible();
  await expect(page.locator('[data-timer]')).toBeVisible();
});

test('six-case F2L subset and staged two-look OLL routes are functional', async ({ page }) => {
  await page.goto('/#/algs/f2l');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(6);
  await expect(page.locator('#algs-view')).toContainText('subset of the full 41-case set');
  await page.goto('/#/algs/oll2');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(16);
  await page.goto('/#/algs/oll2/eo-line');
  await expect(page.getByRole('heading', { name: 'EO · Line' })).toBeVisible();
  await expect(page.locator('.alg-detail__head')).toContainText('All four last-layer edges oriented');
});

test('a verified personal algorithm can be drilled and its self-timed PB is stored', async ({ page }) => {
  await page.goto('/#/algs/oll/45');
  const moves = await page.locator('.alg-entry code').first().textContent();
  await page.locator('.alg-add-own summary').click();
  await page.locator('[data-new-alg]').fill(moves.replaceAll('′', "'"));
  await page.locator('[data-action="save-alg"]').click();
  await expect(page.locator('[data-own-alg-status]')).toHaveText('Verified and saved.');
  const personal = page.locator('[data-personal-algs] [data-drill-alg]').first();
  await personal.click();
  await expect(page.locator('[data-drill]')).toBeVisible();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForTimeout(20);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-drill-result]')).toContainText('PB (all-time)');
  const attemptCount = await page.evaluate(async () => new Promise((resolve, reject) => {
    const request = indexedDB.open('cubesight-algs', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(['attempts'], 'readonly');
      const count = tx.objectStore('attempts').count();
      count.onsuccess = () => resolve(count.result);
    };
  }));
  expect(attemptCount).toBeGreaterThan(0);
});
