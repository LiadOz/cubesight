import { test, expect } from 'playwright/test';

test('progress scopes solve statistics and preserves legacy drill totals across reload', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('progress-fixture')) return;
    localStorage.setItem('progress-fixture','1');
    const now=Date.now();
    localStorage.setItem('cubesight-solves-v1',JSON.stringify({version:1,records:[
      {at:now-1000,solveMs:12000,scramble:'R',solveMoves:["R'"],moveCount:1,focus:'speed'},
      {at:now-500,solveMs:8000,source:'manual',focus:'speed',scramble:'',solveMoves:[],moveCount:0},
    ]}));
    localStorage.setItem('cubesight-progress-v2',JSON.stringify({attempts:20,correct:15,history:[]}));
  });
  await page.goto('/#/progress');
  await expect(page.locator('.progress-stats')).toContainText('12.00');
  await expect(page.locator('.progress-drills')).toContainText('20 cases all time');
  await page.getByLabel('solve source',{exact:true}).selectOption('manual');
  await expect(page.locator('.progress-stats')).toContainText('8.00');
  await page.reload();
  await expect(page.locator('.progress-stats')).toContainText('12.00');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-progress-v2')).attempts)).toBe(20);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
