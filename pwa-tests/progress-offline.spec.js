import { test, expect } from 'playwright/test';

test('installed progress page retains local totals with the network off', async ({ page, context }) => {
  await page.goto('/#/progress');
  await expect(page.locator('.progress-page')).toBeVisible();
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    localStorage.setItem('cubesight-progress-v2',JSON.stringify({attempts:12,correct:9,history:[]}));
  });
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.progress-drills')).toContainText('12 answers all time');
  await expect(page.locator('.progress-drills')).toContainText('75% correct');
  await page.getByRole('link', { name: 'export or import data ›', exact: true }).click();
  await expect(page.locator('.history-page')).toBeVisible();
});
