import { test, expect } from './helpers/coverage-test.js';

test('Cross Scout links accept the solve setup and retain a direct review return pill', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/drills/scout?mode=explore&scramble=R_U&face=U&kind=cross&from=review%3A123%3A7');
  await expect(page.locator('#scout-scramble')).toHaveValue('R U');
  await expect(page.getByRole('link', { name: '← review · solve · move 8' })).toHaveAttribute('href', '#/review/123?move=7');
});
