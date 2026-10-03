import { test, expect } from './helpers/coverage-test.js';
import { generatePllCase } from '../src/pll-logic.js';

test('PLL starts at the requested case and changes case on a same-route link', async ({page}) => {
  await page.goto('/#/drills/pll?cases=T');
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case','T');
  await page.locator('[data-pll-answer="T"]').click();
  await page.locator('#pll-next').click();
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case','T');
  await page.goto('/#/drills/pll?cases=Ua');
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case','Ua');
});
test('PLL opens an exact portable setup with a review return and rejects unavailable positions', async ({page}) => {
  const trial=generatePllCase('T',{auf:''});
  await page.goto(`/#/drills/pll?setup=${encodeURIComponent([...trial.setup,'U2'].join(' '))}&from=review:123:7`);
  await expect(page.locator('#pll-view')).toHaveAttribute('data-pll-case','T');
  await expect(page.getByRole('link',{name:'back to review ›'})).toHaveAttribute('href','#/review/123?move=7');
  await page.goto('/#/drills/pll?setup=review:999999:0');
  await expect(page.locator('#pll-feedback')).toContainText('no longer available');
  await expect(page.locator('[data-pll-answer]')).toHaveCount(0);
  await expect(page.locator('#pll-view')).not.toHaveAttribute('data-pll-case',/./);
});
