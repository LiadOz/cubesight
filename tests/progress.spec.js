import { test, expect } from 'playwright/test';

test('progress charts the selected solve cohort, shares the Orbit, and preserves legacy drill totals', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'progress', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Progress Orbit' })).toBeVisible();
  await expect(page.locator('.progress-page')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-primary-orbit]')).toBeVisible();
  await expect(page.locator('.progress-chart h3')).toContainText(['long-term ao12', 'recent solves', 'stage averages']);
  // The default source is cube; the manual solve is excluded until the filter changes.
  await expect(page.locator('.progress-chart').nth(1)).toContainText('1 most recent timed solve');
  await expect(page.locator('.progress-drills')).toContainText('20 answers all time');
  const source = page.getByRole('combobox', { name: 'solve source' });
  await source.click();
  await page.getByRole('option', { name: 'manual', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'solve source' }).locator('.sel__value')).toHaveText('manual');
  await expect(page.locator('.progress-chart').nth(1)).toContainText('1 most recent timed solve');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'solve source' }).locator('.sel__value')).toHaveText('cube');
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
  await expect(page.locator('.progress-page')).toHaveAttribute('data-ready', 'true');
  const row=page.locator('.progress-drills li').filter({has:page.getByRole('link',{name:'alg drills',exact:true})});
  await expect(row).toContainText('1 answer all time');
  await expect(row).toContainText('1 case due');
  const recorded = await page.evaluate(async () => (await import('/src/algs/runtime.js')).algDatabase.progressFor());
  expect(recorded.items.flatMap(item => item.times)).toEqual([1230]);
  await page.reload();
  await expect(row).toContainText('1 answer all time');
  await expect(row).toContainText('1 case due');
  const reloaded = await page.evaluate(async () => (await import('/src/algs/runtime.js')).algDatabase.progressFor());
  expect(reloaded.items.flatMap(item => item.times)).toEqual([1230]);
});

test('the shared goal controls save, switch to the ao12 Orbit, and clear locally', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('cubesight-goal-v1'));
  await page.goto('/#/progress');
  await expect(page.getByRole('region', { name: 'Progress Orbit' })).toBeVisible();
  await expect(page.locator('.progress-page')).toHaveAttribute('data-ready', 'true');
  await page.getByLabel('ao12 target in seconds').fill('15.25');
  await page.getByRole('button', { name: 'save goal' }).click();
  await expect(page.getByRole('combobox', { name: 'view' }).locator('.sel__value')).toHaveText('ao12 goal');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-goal-v1')).targetSeconds)).toBe(15.25);
  await page.getByRole('button', { name: 'clear' }).click();
  await expect(page.getByRole('combobox', { name: 'view' }).locator('.sel__value')).toHaveText('stage averages');
  expect(await page.evaluate(() => localStorage.getItem('cubesight-goal-v1'))).toBeNull();
});

test('the primary Cube and Orbit stay on screen while progress scrolls', async ({ page }) => {
  await page.goto('/#/progress');
  await expect(page.getByRole('region', { name: 'Progress Orbit' })).toBeVisible();
  await expect(page.locator('.progress-page')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.progress-orbit-wrap')).toBeVisible();
  await expect(page.locator('.progress-cube-mount')).toBeVisible();
  await expect(page.locator('.progress-chart')).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const maxScroll = await page.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate(value => new Promise(resolve => {
        window.scrollTo(0, Math.max(0, document.scrollingElement.scrollHeight - innerHeight) * value);
        requestAnimationFrame(resolve);
      }), fraction);
      const boxes = await page.evaluate(() => {
        const orbit = document.querySelector('.progress-orbit-wrap').getBoundingClientRect();
        const cube = document.querySelector('.progress-cube-mount').getBoundingClientRect();
        const header = document.querySelector('.site-header').getBoundingClientRect();
        return { orbit: { top: orbit.top, bottom: orbit.bottom }, cube: { top: cube.top, bottom: cube.bottom }, header: { top: header.top, bottom: header.bottom }, height: innerHeight, width: innerWidth, scrollWidth: document.scrollingElement.scrollWidth };
      });
      expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.width);
      expect(boxes.orbit.top).toBeGreaterThanOrEqual(-1);
      expect(boxes.orbit.bottom).toBeLessThanOrEqual(boxes.height + 1);
      expect(boxes.cube.top).toBeGreaterThanOrEqual(boxes.header.bottom - 1);
      expect(boxes.cube.bottom).toBeLessThanOrEqual(boxes.height + 1);
    }
    expect(maxScroll).toBeGreaterThan(0);
  }
});
