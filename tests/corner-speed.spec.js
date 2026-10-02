import { test, expect } from './helpers/coverage-test.js';

test('a correct single-corner answer makes the next case ready without a feedback pause', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/#/drills/corners');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await page.evaluate(() => {
    window.cornerFlashes = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!node.matches?.('.corner-result')) continue;
        const style = getComputedStyle(node);
        window.cornerFlashes.push({text: node.textContent, animation: style.animationName, pointerEvents: style.pointerEvents});
      }
    }).observe(document.body, {childList: true, subtree: true});
  });
  await page.keyboard.press('g');
  const firstFlash = await page.evaluate(() => window.cornerFlashes[0]);
  expect(firstFlash.text).toContain('Nice');
  expect({animation: firstFlash.animation, pointerEvents: firstFlash.pointerEvents})
    .toEqual({animation: 'corner-result-flash', pointerEvents: 'none'});
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(first.correct).toBe(true);
  await page.clock.runFor(50);
  await expect(page.locator('#case-number')).toHaveText('case 2');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('#feedback')).toContainText('Nice');
  const flash = await page.locator('[data-color="white"]').evaluate(button => { button.click(); return document.querySelector('.corner-result')?.textContent; });
  expect(flash).toContain('Nice · white');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).attempts)).toBe(2);
  await page.clock.runFor(50);
  await page.locator('[data-action="skip"]').click();
  await expect(page.locator('.corner-result')).toContainText('Skipped');
});

test('correct three-corner answers accept the next input within one frame', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto('/#/drills/corners');
  await page.getByRole('button', { name: 'three corners', exact: true }).click();
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await page.clock.pauseAt(await page.evaluate(() => new Date(Date.now() + 1000).toISOString()));
  await page.keyboard.press('r');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1).correct)).toBe(true);
  await page.clock.runFor(50);
  await expect(page.locator('#case-mode')).toContainText('2/3');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state', 'visible');
  await expect(page.locator('.corner-result')).toContainText('Nice');
  await page.keyboard.press('o');
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(second).toMatchObject({ correct: true, position: 2, ms: 50 });
});
