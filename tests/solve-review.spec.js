import { test, expect } from './helpers/coverage-test.js';

// There is one review screen: #/history/<at>/review/<marker>. The old #/review/<at> page is gone; its address
// still resolves (see routes-unit.test.mjs) and #/review/import is now the import form on the history page.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/review/import');
  await page.evaluate(() => indexedDB.deleteDatabase('cubesight-history'));
  await page.reload();
});

test('the old import address opens the import form on the history page', async ({ page }) => {
  await expect(page).toHaveURL(/#\/history\/import$/);
  await expect(page.getByRole('heading', { name: 'import a solve' })).toBeVisible();
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'import');
});

test('a pasted reconstruction is checked, stored, and opens in the history review', async ({ page }) => {
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/history\/\d+$/);
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'past');
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect(page.locator('.f1-results__actions a', { hasText: 'review' })).toHaveAttribute('href', /#\/history\/\d+/);
  // the imported solve is in history, and it replays
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/#\/history\/\d+\/replay$/);
  // The URL changes before the page's own route state does; arrow keys mean "next solve" until the replay view is up.
  await expect(page.locator('.history-page')).toHaveAttribute('data-view', 'replay');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.history-stage__subline')).toContainText('move 1 of 2');
});

test('alg.cubing.net URL fields decode, and an invalid reconstruction says why', async ({ page }) => {
  await page.getByLabel('alg.cubing.net link').fill('https://alg.cubing.net/?setup=R_U&alg=U-_R-');
  await page.getByRole('button', { name: 'use link fields' }).click();
  await expect(page.getByLabel('scramble')).toHaveValue('R U');
  await expect(page.getByLabel('solution')).toHaveValue("U' R'");
  await page.getByLabel('solution').fill('R Q');
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page.locator('.history-import__error')).toBeVisible();
  await expect(page).toHaveURL(/#\/history\/import$/);
});

test('every old review address lands on its solve in the history', async ({ page }) => {
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/history\/\d+$/);
  const at = Number(page.url().match(/history\/(\d+)/)[1]);
  for (const old of [`#/review/${at}`, `#/review/${at}/retry?move=0`]) {
    await page.goto(`/${old}`);
    await expect(page).toHaveURL(new RegExp(`#/history/${at}(\\?move=0|/review/[\\w-]+)?$`));  // ?move=0 may resolve to its moment once the analysis lands
    await expect(page.locator('.history-page')).toHaveAttribute('data-view', /past|review/);
  }
});
