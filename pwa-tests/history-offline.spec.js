import { test, expect } from 'playwright/test';

test('history, replay and data tools load offline after installation', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: [{ at: 123000, solveMs: 12340, scramble: 'R U', solveMoves: ["U'", "R'"], solved: true }] }));
  });
  await page.goto('/#/history');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.history-count')).toContainText('1 solves');
  await page.locator('.history-solve a').click();
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await page.getByRole('button', { name: 'replay', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.history-stage__subline')).toContainText('move 1 of 2');
});
