import { test, expect } from 'playwright/test';

test('drills hub ranks actual history and starts one canonical filtered top-case round', async ({ page }) => {
  await page.addInitScript(() => {
    const solve = (at, caseId, recognitionMs, executionMs, extraLook = false) => ({
      at, scramble: 'R U', solveMs: 12000, moveCount: 55, solved: true, source: 'smart',
      pllCase: caseId, pllRecognitionMs: recognitionMs, pllExecutionMs: executionMs,
      analysis: { v: 4, solved: true, timed: true, lastLayer: { pll: {
        caseId: caseId.startsWith('pll/') ? caseId : `pll/${caseId}`,
        name: caseId.replace(/^pll\//, ''), from: 10, to: 20,
        recognitionMs, executionMs, extraLook, likelyExtraLook: false,
        configuredLooks: 1, looksTaken: extraLook ? 2 : 1, looks: [],
      } } },
    });
    const history = [
      solve(1, 'Jb', 700, 1200, true), solve(2, 'pll/Jb', 800, 1250),
      solve(3, 'Ua', 1800, 2300), solve(4, 'pll/Ua', 1900, 2400),
      solve(5, 'H', null, 2900), solve(6, 'pll/H', null, 3000),
    ];
    localStorage.setItem('cubesight-solves-v1', JSON.stringify({ version: 1, records: history }));
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/#/drills');
  const train = page.locator('[data-weak-practice="pll"]');
  await expect(train).toHaveAttribute('data-weak-cases', 'Jb,Ua');
  await expect(page.locator('.hub-weak-row')).toHaveCount(3);
  await expect(page.locator('.hub-weak-row').filter({ hasText: 'H' }).getByRole('link', { name: 'execute' })).toHaveAttribute('href', '#/algs/pll/H/drill');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(720);
  await train.click();
  await expect(page).toHaveURL(/#\/drills\/pll\?cases=Jb%2CUa$/);
  await expect(page.locator('#pll-cube')).toBeVisible();
  await expect(page.locator('[data-pll-case]')).toHaveAttribute('data-pll-case', /^(Jb|Ua)$/);
  await page.goto('/#/drills');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-weak-practice="pll"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  const touchHeight = await page.locator('.hub-weak-actions a').first().evaluate(node => node.getBoundingClientRect().height);
  expect(touchHeight).toBeGreaterThanOrEqual(40);
});
