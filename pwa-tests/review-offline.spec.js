import { test, expect } from 'playwright/test';
import { getCase } from '../src/algs/seed/cases.js';
import { invertAlg } from '../src/algs/notation.js';

test('review import, solve replay, and retry routes work offline after install', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Service worker did not take control')), 10_000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
  });

  await context.setOffline(true);
  await page.goto('/#/review/import');
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+$/);
  await expect(page.locator('.sr-cube canvas')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sr-step-count')).toHaveText('move 1 / 2');
  await page.getByRole('button', { name: 'Retry this moment' }).click();
  await expect(page).toHaveURL(/#\/review\/\d+\/retry\?move=1$/);
  await expect(page.locator('.sr-retry-cube canvas')).toBeVisible();
  await page.locator('.sr-virtual-pad button').filter({ hasText: 'R′' }).click();
  await expect(page.locator('.sr-grade')).toContainText('Clean retry');
  await expect(page.locator('.sr-regrade')).toContainText('Review engine regrade');
  expect(errors).toEqual([]);
});


test('canonical OLL and PLL analysis cold-loads in the offline worker', async ({ page, context }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#/drills');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await context.setOffline(true);
  const solution = `${getCase('oll/27').algs[0].moves} ${getCase('pll/T').algs[0].moves}`;
  await page.goto('/#/review/import');
  await page.getByLabel('scramble').fill(invertAlg(solution).join(' '));
  await page.getByLabel('solution').fill(solution);
  await page.getByRole('button',{name:'check and review'}).click();
  await expect(page.locator('.sr-cube canvas')).toBeVisible();
  const captured=await page.evaluate(async()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('cubesight-history',2);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const request=db.transaction('solves').objectStore('solves').getAll();
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const record=request.result.at(-1);db.close();resolve({oll:record.ollCase,pll:record.pllCase,engine:record.analysis?.engine});};
    };
  }));
  expect(captured).toEqual({oll:'oll/27',pll:'pll/T',engine:4});
  expect(errors).toEqual([]);
});
