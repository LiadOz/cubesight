import { test, expect } from 'playwright/test';
import fs from 'node:fs';

// The move guide on the design's five example sequences (docs/design/brain-v2/moves),
// rendered through the dev gallery page in the two priority looks. Screenshots go to
// test-results/move-guide/ for comparison with the M-*.png mockups.
const SHOTS = 'test-results/move-guide';
const LOOKS = [['orbit', 'dark'], ['mono', 'light']];

for (const [style, theme] of LOOKS) {
  test(`move guide renders the five examples (${style}-${theme})`, async ({ page }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1200, height: 1300 });
    await page.goto(`/src/moves/_gallery.html?style=${style}&theme=${theme}`);
    await page.waitForSelector('html[data-gallery-ready]');

    const sequences = {
      scramble: { length: 20, current: "R'", currentIndex: 14, caption: 'counter-cw', groups: 0 },
      tperm: { length: 14, current: 'R2', currentIndex: 6, caption: 'half turn', groups: 2 },
      rotation: { length: 4, current: "y'", currentIndex: 0, caption: 'rotate cube', groups: 1 },
      wide: { length: 8, current: 'r', currentIndex: 0, caption: 'two layers', groups: 0 },
      slice: { length: 3, current: "M'", currentIndex: 0, caption: 'middle layer', groups: 0 },
    };
    for (const [id, want] of Object.entries(sequences)) {
      const section = page.locator(`[data-example="${id}"]`);
      const chips = section.locator('.mg-strip i');
      await expect(chips).toHaveCount(want.length);
      const current = section.locator('.mg-strip i.current');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute('data-index', String(want.currentIndex));
      await expect(current.locator('.mg-label')).toHaveText(want.current.replace("'", '′'));
      await expect(current.locator('.mg-caption')).toHaveText(want.caption);
      // earlier chips are done, later ones are plain
      expect(await chips.evaluateAll(list => list.map(i => ['done', 'current'].find(c => i.classList.contains(c)) ?? ''))).toEqual(
        Array.from({ length: want.length }, (_, i) => (i < want.currentIndex ? 'done' : i === want.currentIndex ? 'current' : '')));
      await expect(section.locator('.mg-strip i.mg-gs')).toHaveCount(want.groups);
      // every chip carries an SVG glyph and an accessible sentence
      await expect(section.locator('.mg-strip i svg.mg-glyph')).toHaveCount(want.length);
      await expect(current).toHaveAttribute('aria-label', new RegExp(`^Move ${want.currentIndex + 1} of ${want.length}: `));
      // the current chip is enlarged
      const widths = await chips.evaluateAll(list => list.map(i => i.getBoundingClientRect().width));
      expect(widths[want.currentIndex]).toBeGreaterThan(widths[(want.currentIndex + 1) % want.length] * 1.4);
    }
    // a rotation chip is dashed, and the fingertrick marker shows on the current chip only
    await expect(page.locator('[data-example="rotation"] .mg-strip i.mg-rot')).toHaveCount(1);
    await expect(page.locator('[data-example="scramble"] .mg-strip i.current .mg-finger')).toBeVisible();
    await expect(page.locator('[data-example="scramble"] .mg-strip i:not(.current) .mg-finger').first()).toBeHidden();
    // theme tokens reach the glyph: the lit layer is the accent colour
    const fills = await page.evaluate(() => {
      const brain = getComputedStyle(document.querySelector('.brain'));
      const lit = getComputedStyle(document.querySelector('.mg-strip i.current .mg-lit'));
      return { accent: brain.getPropertyValue('--b-accent').trim(), lit: lit.fill };
    });
    expect(fills.lit).not.toBe('none');
    expect(fills.accent).toBeTruthy();
    await page.screenshot({ path: `${SHOTS}/${style}-${theme}-chips.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test(`move guide arrows and net variants (${style}-${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1500 });
    for (const variant of ['arrows', 'net']) {
      await page.goto(`/src/moves/_gallery.html?style=${style}&theme=${theme}&variant=${variant}`);
      await page.waitForSelector('html[data-gallery-ready]');
      const stages = page.locator('.mg-stage');
      await expect(stages).toHaveCount(5);
      for (const stage of await stages.all()) {
        await expect(stage).toBeVisible();
        await expect(stage.locator('svg.mg-glyph')).toBeVisible();
        await expect(stage.locator('.mg-stage-text')).not.toBeEmpty();
      }
      await expect(page.locator('[data-example="slice"] .mg-stage-text')).toContainText('middle layer');
      await expect(page.locator('[data-example="rotation"] .mg-stage-text')).toContainText('Rotate the whole cube');
      await page.screenshot({ path: `${SHOTS}/${style}-${theme}-${variant}.png`, fullPage: true });
    }
  });
}

test('the ghost plays the current move on the live cube and the guide hands it on', async ({ page }) => {
  await page.goto('/src/moves/_gallery.html?style=orbit&theme=dark&ghost=1');
  await page.waitForSelector('html[data-gallery-ready]');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-ghost', "R'");
  await expect(canvas).toHaveAttribute('data-ghost-loop', 'true');
  // a slice and a rotation animate too
  await page.evaluate(() => window.gallery.guides.scramble.update({ moves: ["M'", 'y'], index: 0 }));
  await expect(canvas).toHaveAttribute('data-ghost', "M'");
  await expect(canvas).toHaveAttribute('data-ghost-layers', /^[1-9]/);
  await page.evaluate(() => window.gallery.guides.scramble.update({ index: 1 }));
  await expect(canvas).toHaveAttribute('data-ghost', 'y');
  // finished: the ghost is cleared
  await page.evaluate(() => window.gallery.guides.scramble.update({ index: 2 }));
  await expect(canvas).not.toHaveAttribute('data-ghost', /.*/);
  // animateMove turns slices and rotations without throwing
  const done = await page.evaluate(async () => { const c = window.gallery.cube; await c.animateMove("M'", null, 30); await c.animateMove('x', null, 30); await c.animateMove('r', null, 30); return true; });
  expect(done).toBe(true);
});

test('reduced motion: the ghost does not loop and static arrows appear', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/src/moves/_gallery.html?style=orbit&theme=dark&ghost=1');
  await page.waitForSelector('html[data-gallery-ready]');
  await expect(page.locator('canvas')).toHaveAttribute('data-ghost-loop', 'false');
  await expect(page.locator('[data-example="scramble"] .mg-stage')).toBeVisible();
  await expect(page.locator('[data-example="tperm"] .mg-stage')).toBeHidden();
});
