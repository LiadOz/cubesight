// The image set: a fixed list of key screens, each opened once and photographed at
// desktop and phone size in both themes, compared against approved baselines. The
// cube is the test placeholder (it comes from a library we do not test). The same
// frame is checked for sideways scrolling. Replaces the old 785-image snapshot suite,
// the 1,184-cell layout matrix and the per-screen visual specs.
import { test, expect } from './helpers/coverage-test.js';
import { settleAndMeasureOverflow } from './helpers/settle.js';
import { seedHistory } from './helpers/history-seed.js';

const SCREENS = [
  ['solve', '/solve'], ['drills', '/drills'], ['corners', '/drills/corners'], ['f2l', '/drills/f2l'],
  ['pll-drill', '/drills/pll'], ['oll-drill', '/drills/oll'], ['lookahead', '/drills/lookahead'],
  ['cross-planning', '/drills/scout'], ['algs', '/algs'], ['alg-case-pll', '/algs/pll/T'],
  ['alg-case-f2l', '/algs/f2l/FR'], ['progress', '/progress'], ['history', '/history', true],
  ['past-solve', '/history/1000000', true], ['replay', '/history/1000000/replay', true],
  ['timer', '/timer'], ['help', '/help'], ['not-found', '/not-found'],
];
const SIZES = [[1440, 900], [390, 844]];
const CENTERED_DRILLS = new Set(['corners', 'f2l', 'pll-drill', 'oll-drill', 'lookahead', 'cross-planning']);

for (const [id, route, seeded] of SCREENS) {
  test(`screen ${id}`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-01T12:00:00Z') });
    await page.addInitScript(() => { let s = 7; Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647); });
    if (seeded) await seedHistory(page);
    for (const theme of ['dark', 'light']) {
      await page.addInitScript(mode => localStorage.setItem('cubesight-theme', mode), theme);
      await page.goto(`/#${route}`);
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        // Wait out the pages' own loading states instead of a fixed time.
        await page.waitForFunction(() => !/generating scramble|checking \w+ cross|loading \w+…/.test(document.body.innerText)
          && !document.querySelector('[data-state="loading"]'));
        if (id === 'timer') await page.locator('.has-ready-scramble').waitFor();
        const maxScrollWidth = await settleAndMeasureOverflow(page, { maxMs: 300 });
        expect(maxScrollWidth, `${id} scrolls sideways at ${width}px`).toBeLessThanOrEqual(width);
        const imageId = CENTERED_DRILLS.has(id) ? `${id}-centered-fit` : id === 'drills' ? 'drills-menu' : id;
        await expect(page).toHaveScreenshot(`${imageId}-${theme}-${width}.png`, { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.002 });
      }
    }
  });
}
