import {test, expect} from './helpers/coverage-test.js';

test('corner case filters constrain recorded targets and reject unknown cases', async ({page}) => {
  await page.goto('/#/drills/corners?cases=ubr');
  await expect(page.locator('#cube')).toHaveAttribute('data-learning-state','visible');
  await page.locator('[data-action="skip"]').click();
  const answer = await page.evaluate(() => JSON.parse(localStorage.getItem('cubesight-progress-v2')).history.at(-1));
  expect(answer.target).toBe('UBR');
  await page.goto('/#/drills/corners?cases=unknown');
  await expect(page.locator('#feedback')).toContainText('No known corner cases');
  await expect(page.locator('#cube')).toBeHidden();
});

test('F2L planner filters pair slots and leaves invalid inputs with clear feedback', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('cubesight-f2l-mode','planner'));
  await page.goto('/#/drills/f2l?cases=FR');
  await expect(page.locator('.planner-choice').first()).toBeVisible({timeout:30000});
  await expect(page.locator('.planner-choice')).toHaveCount(1);
  await expect(page.locator('.planner-choice')).toContainText('FR slot');
  await page.goto('/#/drills/f2l?cases=unknown');
  await expect(page.locator('#f2l-status')).toContainText('No known F2L cases');
  await expect(page.locator('.planner-choice')).toHaveCount(0);
});
