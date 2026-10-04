import { test, expect } from './helpers/coverage-test.js';
import { mountTestBrain } from './helpers/fake-brain.js';
import { startScramble, completeScramble, solveReverse } from './layout/fake-cube.js';

// Exercise the application route: a component gallery can be correct while the
// mounted screen hides its Orbit or sizes its cube using the legacy layout.
test('solve keeps its Orbit and dial slot through the real flow', async ({ page }) => {
  test.setTimeout(30_000);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await mountTestBrain(page, 'orbit', { route: true, deferConnect: true, awaitConnect: false });
  const brain = page.locator('#brain-view .brain');
  await expect(brain).toHaveAttribute('data-brain-style', 'orbit');
  const orbit = brain.locator('#brain-timeline .orbit');
  const canvas = brain.locator('#brain-cube canvas');
  await expect(orbit).toBeVisible();
  await expect(orbit).toHaveAttribute('data-shape', 'full');
  const original = await canvas.elementHandle();
  await page.evaluate(() => window.testBrain.resolveConnection());
  await expect(brain).toHaveAttribute('data-screen', 'idle');
  await expect(orbit).toHaveAttribute('data-shape', 'open');
  await expect(brain.locator('.brain-stage > .b-clock')).toHaveText('0.00');

  async function fits() {
    for (const [width, height] of [[1280, 720], [1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await expect(orbit).toBeVisible();
      await page.waitForFunction(height => innerHeight === height && document.querySelector('#brain-view .brain-stage').getBoundingClientRect().height < height, height);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const metrics = await page.evaluate(() => {
        const clock = document.querySelector('#brain-view .brain-stage > .b-clock');
        const r = clock.getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight, clockBottom: r.bottom };
      });
      expect(metrics.width).toBeLessThanOrEqual(width + 2);
      expect(metrics.height).toBeLessThanOrEqual(height + 2);
      expect(metrics.clockBottom).toBeLessThanOrEqual(height);
    }
  }
  await fits();
  await page.setViewportSize({ width: 1440, height: 900 });
  const cubeBox = await canvas.boundingBox();
  expect(cubeBox.height).toBeGreaterThan(900 * .5); // canvas includes the camera margin
  const scramble = await startScramble(page, "R U F");
  await expect(brain).toHaveAttribute('data-screen', 'scramble');
  await expect(orbit).toHaveAttribute('data-shape', 'open');
  // A-02: the move to turn is one big glyph under the cube (the verbose paragraph and the old step title are gone).
  await expect(brain.locator('.b-guide .b-guide-glyph')).toHaveText('R');
  await expect(brain.locator('.b-guide .b-guide-line').first()).toHaveText('right face, clockwise');
  await expect(brain.locator('.b-guide .b-guide-count')).toHaveText('move 1 of 3');
  await fits();
  await completeScramble(page, scramble);
  await expect(brain).toHaveAttribute('data-screen', 'inspection');
  await expect(brain.locator('.brain-stage > .b-clock')).toBeVisible();
  await expect(brain.locator('.brain-stage > .b-clock')).not.toHaveText('0.00');
  await fits();
  await page.evaluate(() => window.testBrain.emitTurns("F'"));
  await expect(brain).toHaveAttribute('data-screen', 'solving');
  await expect(brain.locator('.brain-stage > .b-steptitle')).toBeVisible();   // A-04: the live stage title above the timer
  await expect(brain.locator('.brain-stage > .b-steptitle')).toHaveText('cross');
  await expect(brain.locator('.brain-stage > .b-clock')).toBeVisible();
  await fits();
  await page.evaluate(() => window.testBrain.emitTurns('F'));
  await solveReverse(page, scramble);
  await expect(brain).toHaveAttribute('data-screen', 'results');
  await expect(orbit).toBeVisible();
  expect(await original.evaluate(node => node === document.querySelector('#brain-cube canvas'))).toBe(true);
  await expect(brain.locator('canvas')).toHaveCount(1);
});

test('a long scramble keeps every move visible, including the return path', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await mountTestBrain(page, 'orbit', { route: true });
  await expect(page.locator('#brain-view .brain')).toHaveAttribute('data-brain-style', 'orbit');
  const scramble = "R U F2 L D' B U2 R' F D2 L2 B' U R2 D F' L U' B2 D";
  await startScramble(page, scramble);
  // The scramble ring is move labels at r=330 (A-02), one per move.
  const labels = page.locator('#brain-timeline .orbit__move-label');
  await expect(labels).toHaveCount(20);
  await page.evaluate(() => window.testBrain.emitTurns('U'));
  await expect(page.locator('#brain-timeline .orbit__segment.is-wrong')).not.toHaveCount(0);
  await expect(labels).toHaveCount(21);   // the way back joins the ring as its own section
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#brain-moves')).toBeVisible();
  // Phone: the wrapped sequence keeps every move, with the way back inline as an amber spaced section.
  await expect(page.locator('#brain-moves .mg-strip i:not(.undo):not(.mg-gap)')).toHaveCount(20);
  await expect(page.locator('#brain-moves .mg-strip i.undo')).toHaveCount(1);
});
