import { test, expect } from 'playwright/test';
import { mountTestBrain, startGuidedScramble } from './helpers/fake-brain.js';

// P0 regression: after a WRONG turn in a guided scramble the cue used to lose the
// current-move underline and show no way back (no move was "current" while a
// detour existed, so the recovery bubble had nothing to attach to).
const SCRAMBLE = "R2 D' F2 U B2 L' U2 F";   // two correct turns (R2, D') put the plan on F2
const classes = page => page.evaluate(() => [...document.querySelectorAll('#brain-test #brain-moves i')].map(i => i.className));
const head = (page, n) => classes(page).then(list => list.slice(0, n));
const recoveryText = page => page.evaluate(() => [...document.querySelectorAll('#brain-test #brain-recovery .mg-label')].map(n => n.textContent));

for (const style of ['orbit', 'mono']) {
  for (const [name, wrong, undo] of [['a wrong face', 'L', ['L′']], ['a wrong double', 'U2', ['U2']], ['a wrong prime', "U'", ['U']]]) {
    test(`a wrong turn keeps the plan marked and shows how to undo it: ${name} (${style})`, async ({ page }) => {
      test.setTimeout(60_000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await mountTestBrain(page, style);
      const brain = page.locator('#brain-test');
      await startGuidedScramble(page, SCRAMBLE);
      await expect(brain.locator('#brain-phase-label')).toHaveText('Perform the scramble');
      await page.evaluate(() => window.testBrain.emitTurns("R2 D'"));
      await expect(brain.locator('#brain-phase-detail')).toHaveText(/Scramble turn 3 of/);
      expect(await head(page, 4)).toEqual(['done', 'done', 'current', '']);

      await page.evaluate(w => window.testBrain.emitTurns(w), wrong);
      // The plan move stays marked current, now as wrong; the way back is shown.
      await expect.poll(() => head(page, 4)).toEqual(['done', 'done', 'current wrong', '']);
      await expect(brain.locator('#brain-recovery')).toBeVisible();
      await expect(brain.locator('#brain-recovery')).toContainText(/undo/i);
      expect(await recoveryText(page)).toEqual(undo);

      // Following the recovery returns to the plan and the underline is back on F2.
      await page.evaluate(u => window.testBrain.emitTurns(u), undo.map(m => m.replace('′', "'")).join(' '));
      await expect.poll(() => head(page, 4)).toEqual(['done', 'done', 'current', '']);
      await expect(brain.locator('#brain-recovery')).toBeHidden();

      // ...and the scramble can be finished: inspection starts.
      await page.evaluate(s => window.testBrain.emitTurns(s), SCRAMBLE.split(' ').slice(2).join(' '));
      await expect(brain.locator('#brain-phase-label')).toHaveText('Inspection');
      expect(errors).toEqual([]);
    });
  }

  test(`a second wrong turn while recovering extends or merges the recovery (${style})`, async ({ page }) => {
    test.setTimeout(60_000);
    await mountTestBrain(page, style);
    const brain = page.locator('#brain-test');
    await startGuidedScramble(page, SCRAMBLE);
    await expect(brain.locator('#brain-phase-label')).toHaveText('Perform the scramble');
    await page.evaluate(() => window.testBrain.emitTurns("R2 D' L"));
    await expect.poll(() => recoveryText(page)).toEqual(['L′']);
    // The same layer again merges into a half turn: undo L2.
    await page.evaluate(() => window.testBrain.emitTurns('L'));
    await expect.poll(() => recoveryText(page)).toEqual(['L2']);
    // Another layer extends it, most recent first.
    await page.evaluate(() => window.testBrain.emitTurns('U'));
    await expect.poll(() => recoveryText(page)).toEqual(['U′', 'L2']);
    expect(await head(page, 3)).toEqual(['done', 'done', 'current wrong']);
    await page.evaluate(() => window.testBrain.emitTurns("U' L2"));
    await expect.poll(() => head(page, 3)).toEqual(['done', 'done', 'current']);
    await expect(brain.locator('#brain-recovery')).toBeHidden();
  });
}
