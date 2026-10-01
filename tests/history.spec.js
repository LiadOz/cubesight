import { test, expect } from 'playwright/test';

const records = [
  { at: 1000000, scramble: 'R U', solveMs: 12340, penalty: null, focus: 'speed', source: 'smart', solved: true, solveMoves: ["U'", "R'"], moveCount: 2 },
  { at: 1100000, scramble: 'F2', solveMs: 15000, penalty: '+2', focus: 'flow', source: 'manual', solved: true, solveMoves: [] },
];
async function seed(page, style = 'orbit') {
  await page.addInitScript(({ records, style }) => {
    localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records }));
    if (!localStorage.getItem('cubesight-brain-settings-v2')) localStorage.setItem('cubesight-brain-settings-v2', JSON.stringify({ style }));
  }, { records, style });
  await page.goto('/#/history');
  await expect(page.locator('.history-count')).toContainText('2 solves');
}

test('history filters, replays and edits records without affecting their source', async ({ page }) => {
  await seed(page);
  const list = page.locator('.history-list');
  await expect(list.locator('button')).toHaveCount(2);
  await page.locator('select[name="source"]').selectOption('manual');
  await expect(list.locator('button')).toHaveCount(1);
  await list.locator('button').click();
  await expect(page.locator('.history-detail')).toContainText('No moves were recorded.');
  await page.locator('select[name="source"]').selectOption('smart');
  await list.locator('button').click();
  await expect(page.locator('.history-cube canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(page.locator('[data-move]')).toContainText('move 1 of 2');
  await page.getByRole('button', { name: '+2', exact: true }).click();
  await expect(page.locator('.history-detail h2')).toHaveText('14.34+');
  await page.getByRole('button', { name: 'delete', exact: true }).click();
  await expect(list.locator('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'undo', exact: true }).click();
  await expect(list.locator('button')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.history-count')).toContainText('2 solves');
  await expect(list).toContainText('14.34+');
});

test('history imports csTimer atomically and exports it; gap setting persists', async ({ page }) => {
  await seed(page);
  await page.locator('.history-data summary').click();
  const data = { session1: [[[0, 21340], 'L U', '', 1200], [[-1, 22450], "L'", '', 1201]] };
  await page.locator('[data-import="cstimer"]').setInputFiles({ name: 'cstimer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator('.history-status')).toContainText('Imported 2 solves.');
  await expect(page.locator('.history-count')).toContainText('4 solves');
  await page.locator('[data-import="cstimer"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ session1: [[[99, 1], '', '', 1]] })) });
  await expect(page.locator('.history-status')).toContainText('No data was imported.');
  await expect(page.locator('.history-count')).toContainText('4 solves');
  await page.locator('[name="gap"]').fill('45');
  await page.locator('[name="gap"]').press('Tab');
  await expect(page.locator('.history-status')).toContainText('45 minutes');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'export csTimer', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('cstimer.json');
  await page.reload();
  await page.locator('.history-data summary').click();
  await expect(page.locator('[name="gap"]')).toHaveValue('45');
});
