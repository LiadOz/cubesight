import {test,expect} from 'playwright/test';

test('three-corner clock includes feedback between answers in displayed and logged times',async({page})=>{
  await page.clock.install();await page.goto('/');
  await page.getByRole('button',{name:'Three corners',exact:true}).click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state','visible');
  // Freeze at the currently running fake clock so exact answer-to-answer
  // intervals can be checked without wall-clock/CDP latency.
  await page.clock.pauseAt(await page.evaluate(()=>new Date(Date.now()+1000).toISOString()));
  await page.keyboard.press('w');
  await expect(page.locator('.timer-label')).toContainText('clock already running');
  await page.clock.runFor(300);
  expect(parseFloat(await page.locator('#timer').textContent())).toBeGreaterThanOrEqual(.28);
  await page.clock.runFor(1200);
  await expect(page.locator('#case-mode')).toContainText('2/3');
  expect(parseFloat(await page.locator('#timer').textContent())).toBeGreaterThanOrEqual(1.48);
  await page.keyboard.press('w');
  const second=await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(second.ms).toBe(1500);
  expect(second).toMatchObject({ mode: 'triple', position: 2, target: 'UBR', selected: 'white', glance: false, exposureMs: null });
  expect(second.visible).toHaveLength(2);
  expect(second.family.split('-')).toContain(second.missing);
  await page.clock.runFor(1500);
  await expect(page.locator('#case-mode')).toContainText('3/3');
  await page.keyboard.press('w');
  const third=await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(third.ms).toBe(1500);
});

test('timeout for the next corner is measured from the previous input',async({page})=>{
  await page.clock.install();await page.goto('/');
  await page.getByRole('button',{name:'Three corners',exact:true}).click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state','visible');
  await page.clock.pauseAt(await page.evaluate(()=>new Date(Date.now()+1000).toISOString()));
  await page.keyboard.press('w');
  await page.clock.fastForward(10_000);
  await expect(page.locator('#pause-overlay')).toBeVisible();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cubesight-progress-v2')).attempts)).toBe(1);
});
