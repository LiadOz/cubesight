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

test('changing to a different algorithm case resets scroll to the page top', async ({ page }) => {
  await page.goto('/#/algs/oll/1/drill');
  await expect(page.locator('[data-drill]')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => { location.hash = '#/algs/oll/2'; });
  await expect(page.getByRole('heading', { name: 'Zamboni' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('six-case F2L subset and staged two-look OLL routes are functional', async ({ page }) => {
  await page.goto('/#/algs/f2l');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(6);
  await expect(page.locator('#algs-view')).toContainText('subset of the full 41-case set');
  await page.locator('#algs-view .alg-case-card').first().click();
  await expect(page.locator('.alg-cube-card')).toContainText('Set up this F2L case on your cube before each round');
  await expect(page.locator('.alg-cube-card')).toContainText('do not use the no-reset virtual repaint flow');
  await page.goto('/#/algs/oll2');
  await expect(page.locator('#algs-view .alg-case-card')).toHaveCount(16);
  await page.goto('/#/algs/oll2/eo-line');
  await expect(page.getByRole('heading', { name: 'EO · Line' })).toBeVisible();
  await expect(page.locator('.alg-detail__head')).toContainText('All four last-layer edges oriented');
});

test('algorithm case screens render across Orbit/Mono and light/dark at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const style of ['orbit', 'mono']) for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate(([style, theme]) => {
      localStorage.setItem('cubesight-theme', theme);
      localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
    }, [style, theme]);
    await page.reload();
    await page.goto('/#/algs/oll/1');
    const screen = page.locator('#algs-view .alg-detail');
    await expect(screen).toBeVisible();
    await expect(page.locator('#algs-view .alg-page')).toHaveAttribute('data-brain-style', style);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.alg-cube-card')).toBeVisible();
    await expect(page.locator('.alg-entry-grid .alg-entry')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: `/tmp/cubesight-algs-${style}-${theme}-390.png`, fullPage: true });
  }
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
