import { test, expect } from 'playwright/test';

function fixture(drill, preset) {
  const startedAt=Date.now();
  return {version:1,lastDrill:drill,settings:{},bestCombos:{},days:[],round:{drill,preset,startedAt,updatedAt:startedAt,status:'active',answers:Array.from({length:19},()=>({correct:true,ms:500,at:startedAt,caseId:'fixture'})),combo:19,bestCombo:19}};
}
for(const [drill,path,skip] of [['corners','corners','[data-action="skip"]'],['pll','pll','#pll-skip']]) {
  test(`${drill} resumes a round, completes once, and starts one more`,async({page})=>{
    await page.addInitScript(value=>localStorage.setItem('cubesight-shell-v1',JSON.stringify(value)),fixture(drill,{kind:'cases',cases:20}));
    await page.goto(`/#/drills/${path}`);
    await expect(page.locator('.quick-round')).toContainText('1 cases left');
    await page.locator(skip).click();
    await expect(page.locator('.quick-round')).toContainText('19 of 20 correct');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-rounds-v1')).rounds.length)).toBe(1);
    await page.getByRole('button',{name:'one more round',exact:true}).click();
    await expect(page.locator('.quick-round')).toContainText('20 cases left');
  });
}
test('F2L timed round ends without another answer and saves results on a phone',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/drills/f2l');
  await expect(page.locator('.quick-round')).toBeVisible();
  await page.clock.install();
  await page.locator('.quick-round').getByRole('button',{name:'30 s',exact:true}).click();
  await page.clock.fastForward(30100);
  await expect(page.locator('.quick-round')).toContainText('round complete');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-rounds-v1')).rounds[0].reason)).toBe('time');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

for (const drill of ['oll', 'lookahead']) {
  test(`${drill} exposes all shared quick-round presets`, async ({ page }) => {
    await page.goto(`/#/drills/${drill}`);
    const controls = page.locator('.quick-round');
    await expect(controls.getByRole('button', { name: '2 min', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: '20 cases', exact: true })).toBeVisible();
    await expect(controls.getByRole('button', { name: '30 s', exact: true })).toBeVisible();
  });
}
