import { test, expect } from 'playwright/test';
import { mountTestBrain, startGuidedScramble } from './helpers/fake-brain.js';

// P0 regression: after a WRONG turn, the current plan move stays marked and
// recovery turns appear on the shared Orbit.
const SCRAMBLE = "R2 D' F2 U B2 L' U2 F";   // two correct turns (R2, D') put the plan on F2
const classes = page => page.evaluate(() => [...document.querySelectorAll('#brain-view #brain-moves i')].map(i => i.className));
const head = (page, n) => classes(page).then(list => list.slice(0, n));
const recoveryText = (page, style) => style === 'orbit'
  ? page.locator('#brain-view [data-segment^="undo-"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')?.split(',')[0].replaceAll("'", '′')))
  : page.locator('#brain-view #brain-recovery .mg-strip i').evaluateAll(nodes => nodes.map(node => node.textContent));

for (const style of ['orbit', 'mono']) {
  for (const [name, wrong, undo] of [['a wrong face', 'L', ['L′']], ['a wrong double', 'U2', ['U2']], ['a wrong prime', "U'", ['U']]]) {
    test(`a wrong turn keeps the plan marked and shows how to undo it: ${name} (${style})`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await mountTestBrain(page, style, { route: true });
      const brain = page.locator('#brain-view');
      await startGuidedScramble(page, SCRAMBLE, '#brain-view');
      await expect(brain.locator('#brain-phase-label')).toHaveText('apply scramble');
      await page.evaluate(() => window.testBrain.emitTurns("R2 D'"));
      await expect(brain.locator('#brain-phase-detail')).toHaveText(/Scramble move 3 of/);
      expect(await head(page, 4)).toEqual(['done', 'done', 'current', '']);
      // The real shared Cube stays mounted while the current plan move is emphasized.
      await expect(brain.locator('.shared-cube')).toBeVisible();

      await page.evaluate(w => window.testBrain.emitTurns(w), wrong);
      // The plan move stays marked current, now as wrong; the way back is shown.
      await expect.poll(() => head(page, 4)).toEqual(['done', 'done', 'current wrong', '']);
      if (style === 'orbit') await expect(brain.locator('[data-segment^="undo-"]')).toHaveCount(undo.length);
      else await expect(brain.locator('#brain-recovery')).toBeVisible();
      expect(await recoveryText(page, style)).toEqual(undo);

      // Following the recovery returns to the plan and the underline is back on F2.
      await page.evaluate(u => window.testBrain.emitTurns(u), undo.map(m => m.replace('′', "'")).join(' '));
      await expect.poll(() => head(page, 4)).toEqual(['done', 'done', 'current', '']);
      if (style === 'orbit') await expect(brain.locator('[data-segment^="undo-"]')).toHaveCount(0);
      else await expect(brain.locator('#brain-recovery')).toBeHidden();

      // ...and the scramble can be finished: inspection starts.
      await page.evaluate(s => window.testBrain.emitTurns(s), SCRAMBLE.split(' ').slice(2).join(' '));
      await expect(brain.locator('#brain-phase-label')).toHaveText('inspection');
      expect(errors).toEqual([]);
    });
  }

  test(`a second wrong turn while recovering extends or merges the recovery (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    await mountTestBrain(page, style, { route: true });
    const brain = page.locator('#brain-view');
    await startGuidedScramble(page, SCRAMBLE, '#brain-view');
    await expect(brain.locator('#brain-phase-label')).toHaveText('apply scramble');
    await page.evaluate(() => window.testBrain.emitTurns("R2 D' L"));
    await expect.poll(() => recoveryText(page, style)).toEqual(['L′']);
    // The same layer again merges into a half turn: undo L2.
    await page.evaluate(() => window.testBrain.emitTurns('L'));
    await expect.poll(() => recoveryText(page, style)).toEqual(['L2']);
    // Another layer extends it, most recent first.
    await page.evaluate(() => window.testBrain.emitTurns('U'));
    await expect.poll(() => recoveryText(page, style)).toEqual(['U′', 'L2']);
    expect(await head(page, 3)).toEqual(['done', 'done', 'current wrong']);
    await page.evaluate(() => window.testBrain.emitTurns("U' L2"));
    await expect.poll(() => head(page, 3)).toEqual(['done', 'done', 'current']);
    if (style === 'orbit') await expect(brain.locator('[data-segment^="undo-"]')).toHaveCount(0);
    else await expect(brain.locator('#brain-recovery')).toBeHidden();
  });
}
