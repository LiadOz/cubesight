import { test, expect } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.resolve('test-results/solve-review');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/review/import');
  await page.evaluate(() => indexedDB.deleteDatabase('cubesight-history'));
  await page.reload();
});

test('paste reconstruction validates, persists, opens the review, and steps the 3D cube', async ({ page }) => {
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+$/);
  await expect(page.getByText('Solve review · 2 moves')).toBeVisible();
  await expect(page.locator('.sr-moves li')).toHaveCount(2);
  await expect(page.locator('.sr-label.sr-drill').first()).toHaveAttribute('href', /#\/drills\/(scout|f2l|pll)\?.*setup=review%3A\d+%3A0.*from=%23%2Freview%2F\d+/);
  await expect(page.locator('.sr-moves [data-move="0"]')).toHaveAttribute('title', /shortest path|verified move evaluation/i);
  await expect(page.locator('.sr-cube canvas')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sr-step-count')).toHaveText('move 1 / 2');
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, 'review-desktop.png'), fullPage: true });
});

test('alg.cubing.net URL fields decode and imported solves have no timing labels', async ({ page }) => {
  await page.getByLabel('alg.cubing.net link').fill('https://alg.cubing.net/?setup=R_U&alg=U-_R-');
  await page.getByRole('button', { name: 'use link fields' }).click();
  await expect(page.getByLabel('scramble')).toHaveValue('R U');
  await expect(page.getByLabel('solution')).toHaveValue("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+$/);
  await expect(page.locator('.sr-position-note')).not.toContainText(/\d+\.\d{2} s/);
  await expect(page.locator('.sr-label')).not.toContainText(/Pause|Slow recog|Flow/);
});

test('mobile review retains accessible step controls, moments, and retry navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page.locator('.sr-layout')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous move' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next move' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry this moment' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+\/retry\?move=0$/);
  await expect(page.locator('.sr-retry-cube canvas')).toBeVisible();
  await page.locator('.sr-virtual-pad button').filter({ hasText: 'U′' }).click();
  await page.locator('.sr-virtual-pad button').filter({ hasText: 'R′' }).click();
  await expect(page.locator('.sr-grade')).toContainText(/Clean retry|Retry complete/);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, 'review-retry-mobile.png'), fullPage: true });
});

test('guided retry runs through the real solve tracker with a replay cube and regrades the continuation', async ({ page }) => {
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/review\/(\d+)$/);
  await expect(page.locator('.sr-layout')).toBeVisible();
  const at = Number(new URL(page.url()).hash.match(/review\/(\d+)/)[1]);
  await page.getByRole('button', { name: 'Retry this moment' }).click();
  await expect(page).toHaveURL(new RegExp(`#\\/review\\/${at}\\/retry\\?move=0$`));
  await expect(page.locator('.sr-retry-cube canvas')).toBeVisible();
  await page.evaluate(async (recordAt) => {
    const [{ openHistory }, { retryPlan }, { createReplayScript, createReplaySession }, { createSolveReview }, { createSolveLive }] = await Promise.all([
      import('/src/store/history.js'), import('/src/review/replay.js'), import('/src/replay.js'), import('/src/review/index.js'), import('/src/solve-live.js'),
    ]);
    const history = await openHistory();
    const record = history.records.find(item => item.at === recordAt);
    const plan = retryPlan(record, 0);
    const fake = createReplaySession(createReplayScript({ scramble: plan.setup.join(' '), solve: plan.expected.join(' ') }));
    const host = document.createElement('div'); host.id = 'retry-fake-host'; document.body.append(host);
    const page = createSolveReview(host, {
      path: `/review/${recordAt}/retry`, at: recordAt, move: 0, smartCube: fake,
      createSolveLive: session => { const live = createSolveLive(session); window.__reviewFakeLive = live; return live; },
    });
    await page.ready;
    window.__reviewFakeCube = fake;
    window.__reviewFakePlan = plan;
    window.__reviewFakePage = page;
  }, at);
  const fakeRetry = page.locator('#retry-fake-host');
  await fakeRetry.getByRole('button', { name: 'connect cube' }).click();
  await expect(fakeRetry.locator('.sr-retry-status')).toContainText('Cube connected and synced');
  await fakeRetry.getByRole('button', { name: 'guide setup' }).click();
  const setupCount = await page.evaluate(() => window.__reviewFakePlan.setup.length);
  for (let i = 0; i < setupCount; i++) await page.evaluate(() => window.__reviewFakeCube.step());
  await expect(fakeRetry.locator('.sr-retry-status')).toContainText('Position ready');
  const attemptCount = await page.evaluate(() => window.__reviewFakePlan.expected.length);
  for (let i = 0; i < attemptCount; i++) await page.evaluate(() => window.__reviewFakeCube.step());
  await expect(fakeRetry.locator('.sr-grade')).toContainText(/Clean retry|Retry complete/);
  await expect(fakeRetry.locator('.sr-regrade')).toContainText('Review engine regrade');
  await page.evaluate(() => window.__reviewFakePage.detach());
});
