import { test, expect } from 'playwright/test';

test('new recognition and lookahead drills cold-load from the installed cache',async({page,context})=>{
  await page.goto('/#/drills');
  await expect(page.locator('#drills-view')).toBeVisible();
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await context.setOffline(true);
  await page.goto('/#/drills/oll?cases=1');
  await expect(page.locator('#oll-answers button')).toHaveCount(1);
  await page.locator('#oll-answers button').click();
  await expect(page.locator('#oll-feedback')).toContainText('Nice');
  await page.goto('/#/drills/lookahead?cases=1');
  await expect(page.locator('#la-choices button').first()).toBeVisible({timeout:30000});
  await page.locator('#la-choices button').first().click();
  await expect(page.locator('#la-feedback')).toContainText(/choice|pair/);
  await page.goto('/#/drills/corners?round=20');
  await expect(page.locator('.quick-round')).toContainText('20 cases left');
  await page.locator('[data-action="skip"]').click();
  await expect(page.locator('.quick-round')).toContainText('19 cases left');
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('.quick-round')).toContainText('19 cases left');
});
