import { test, expect } from 'playwright/test';

test('the OLL drill opens the selected canonical case, scores it, and reveals a credited alg', async ({ page }) => {
  await page.goto('/#/drills/oll?cases=oll%2F1');
  await expect(page.locator('#oll-view')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OLL recognition' })).toBeVisible();
  await expect(page.getByRole('button', { name: /1 · Runway, Blank/ })).toBeVisible();
  await page.getByRole('button', { name: /1 · Runway, Blank/ }).click();
  await expect(page.locator('#oll-reveal')).toContainText('OLL 1 · Runway, Blank');
  await expect(page.locator('#oll-reveal a')).toHaveAttribute('href', /speedsolving\.com/);
  await expect(page.locator('#oll-combo')).toHaveText('combo 1');
});

test('the lookahead drill offers planner-verified next-pair choices', async ({ page }) => {
  await page.goto('/#/drills/lookahead');
  await expect(page.locator('#lookahead-view')).toBeVisible();
  await page.getByRole('button', { name: 'start 20-case round' }).click();
  const choices = page.locator('.lookahead-choice');
  await expect(choices.first()).toBeVisible({ timeout: 18_000 });
  await expect(choices.first()).toContainText('verified');
  await choices.first().click();
  await expect(page.locator('#la-feedback')).not.toHaveText('Pick the pair you would solve first.');
});
