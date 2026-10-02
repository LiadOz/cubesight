import { test, expect } from './helpers/coverage-test.js';

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
  await expect(page.locator('.progress-drills')).toContainText('20 answers all time');
  await page.getByLabel('solve source',{exact:true}).selectOption('manual');
  await expect(page.locator('.progress-stats')).toContainText('8.00');
  await page.reload();
  await expect(page.locator('.progress-stats')).toContainText('12.00');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-progress-v2')).attempts)).toBe(20);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});


test('progress reads recorded algorithm practice and its due schedule after reload', async ({ page }) => {
  await page.goto('/#/algs/pll/T');
  await expect(page.locator('.alg-detail h1')).toContainText('T');
  await page.evaluate(async () => {
    const { algDatabase } = await import('/src/algs/runtime.js');
    const alg = (await algDatabase.listAlgs('pll/T'))[0];
    await algDatabase.recordAttempt({caseId:'pll/T',algId:alg.id,clean:true,executionMs:1230});
    localStorage.setItem('cubesight-alg-learning-v1',JSON.stringify({version:1,trial:1,items:{[`alg|${alg.id}`]:{attempts:1,correct:1,due:Date.now()-1,dueTrial:0}}}));
  });
  await page.goto('/#/progress');
  const row=page.locator('.progress-drills article').filter({has:page.getByRole('link',{name:'alg drills ›',exact:true})});
  await expect(row).toContainText('1 answer all time');
  await expect(row).toContainText('1.23 s median');
  await expect(row).toContainText('1 case due');
  await page.reload();
  await expect(row).toContainText('1 answer all time');
  await expect(row).toContainText('1 case due');
});
