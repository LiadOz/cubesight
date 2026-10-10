import { test, expect } from 'playwright/test';
import { seedHistory, HISTORY_SEED } from './helpers/history-seed.js';

const menu = page => page.locator('.f1-results__more-body');

test('history and fresh results share their menu; penalties persist and replay remains available', async ({ page }) => {
  await seedHistory(page);
  await page.goto('/#/history/1000000');
  const results = page.locator('.f1-results');
  await expect(results.getByRole('button', { name: 'next scramble', exact: true })).toBeVisible();
  await expect(results.getByRole('link', { name: 'review', exact: true })).toBeVisible();
  await results.getByRole('button', { name: 'more…', exact: true }).click();
  await expect(menu(page)).toBeVisible();
  const historyMenu = await menu(page).locator('button').allTextContents();
  await menu(page).getByRole('button', { name: '+2', exact: true }).click();
  await expect(results.locator('.f1-results__number')).toHaveText('12.34 +2');
  await results.getByRole('button', { name: 'more…', exact: true }).click();
  await menu(page).getByRole('button', { name: 'DNF', exact: true }).click();
  await expect(results.locator('.f1-results__number')).toHaveText('DNF(12.34)');
  await results.getByRole('button', { name: 'more…', exact: true }).click();
  await menu(page).getByRole('button', { name: 'clear penalty', exact: true }).click();
  await expect(results.locator('.f1-results__number')).toHaveText('12.34');

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await results.getByRole('button', { name: 'more…', exact: true }).click();
    await expect(menu(page)).toBeInViewport();
    const rect = await menu(page).boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    await results.getByRole('button', { name: 'more…', exact: true }).click();
  }
  await page.reload();
  await expect(results.locator('.f1-results__number')).toHaveText('12.34');
  await results.getByRole('button', { name: 'more…', exact: true }).click();
  await menu(page).getByRole('button', { name: 'replay solve', exact: true }).click();
  await expect(page).toHaveURL(/#\/history\/1000000\/replay$/);

  await page.goto('/?brainGallery=1&fixture=results&frozen=1#/solve');
  await page.locator('.f1-results').getByRole('button', { name: 'more…', exact: true }).click();
  expect(await menu(page).locator('button').allTextContents()).toEqual(historyMenu);
});

test('a history stage opens the shared drawer with move scrubbing and pinning', async ({ page }) => {
  let releaseControls;
  const controlsReady = new Promise(resolve => { releaseControls = resolve; });
  await page.route('**/src/brain/styles/orbit/results-orbit.js*', async route => { await controlsReady; await route.continue(); });
  await seedHistory(page, { ...HISTORY_SEED, records: [{ ...HISTORY_SEED.records[0], splits: [{ key: 'cross', ms: 12340, moves: 2 }] }] });
  await page.goto('/#/history/1000000', { waitUntil: 'domcontentloaded' });
  await page.locator('.history-stage [data-segment="cross"]').press('Enter');
  releaseControls();
  const detail = page.locator('.b-rev-detail');
  await expect(detail).toBeVisible();
  expect(await detail.evaluate(node => getComputedStyle(node).position)).toBe('fixed');
  await detail.locator('.b-rev-mv[data-at="1"]').click();
  await expect(detail).toBeVisible();
  await detail.locator('.b-rev-pin-detail').click();
  await expect(detail.locator('.b-rev-pin-detail')).toHaveText('pinned · unpin');
  await detail.locator('[data-act="close"]').click();
  await expect(detail).toBeHidden();
});


test('deleting from the shared history menu can be undone even for the last solve', async ({ page }) => {
  await seedHistory(page);
  await page.goto('/#/history/1000000');
  await page.locator('.f1-results').getByRole('button', { name: 'more…', exact: true }).click();
  await menu(page).getByRole('button', { name: 'delete solve', exact: true }).click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.locator('.history-count')).toContainText('0 solves');
  await page.getByRole('button', { name: 'undo delete', exact: true }).click();
  await expect(page.locator('.history-count')).toContainText('1 solves');
});
