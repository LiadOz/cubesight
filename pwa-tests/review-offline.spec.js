import { test, expect } from 'playwright/test';
import { ENGINE_VERSION } from '../src/analysis/segment.js';
import { getCase } from '../src/algs/seed/cases.js';
import { invertAlg } from '../src/algs/notation.js';

test('review import and solve replay routes work offline after install', async ({ page, context }) => {
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
  await expect(page).toHaveURL(/#\/history\/import$/);
  await page.getByLabel('scramble').fill('R U');
  await page.getByLabel('solution').fill("U' R'");
  await page.getByRole('button', { name: 'check and review' }).click();
  // the imported solve opens in the history review, and replays, with no network
  await expect(page).toHaveURL(/#\/history\/\d+$/);
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/#\/history\/\d+\/replay$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.history-stage__subline')).toContainText('move 1 of 2');
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
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
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
  expect(captured).toEqual({oll:'oll/27',pll:'pll/T',engine:ENGINE_VERSION});
  expect(errors).toEqual([]);
});
