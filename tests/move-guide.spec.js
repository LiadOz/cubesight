import { test, expect } from './helpers/coverage-test.js';

// The move guide (plain notation chips) and the 3D cue, through the dev gallery page
// (src/moves/_gallery.html). The cue's motion over time is unit-tested (move-cue-unit.test.mjs).
const LOOKS = [['orbit', 'dark'], ['mono', 'light']];
const gallery = (page, style = 'orbit', theme = 'dark', extra = '') => page.goto(`/src/moves/_gallery.html?style=${style}&theme=${theme}${extra}`)
  .then(() => page.waitForSelector('html[data-gallery-ready]'));
const cueState = page => page.evaluate(() => window.gallery.cube.getCueState());
const cueAngle = page => cueState(page).then(state => state?.angle ?? 0);

// The cue's motion is what this spec tests, so animations stay on.
test.use({ storageState: { cookies: [], origins: [] } });

test('overflowing move strips scroll with Home, End, and arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await gallery(page, 'orbit', 'dark');
  const strip = page.locator('[data-example="scramble"] .mg-strip');
  await strip.evaluate(el => { el.scrollLeft = 0; });
  await strip.focus();
  const max = await strip.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(max).toBeGreaterThan(0);
  await strip.press('End');
  await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await strip.press('ArrowLeft');
  const afterArrow = await strip.evaluate(el => el.scrollLeft);
  expect(afterArrow).toBeLessThan(max);
  await strip.press('Home');
  await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBe(0);
});

for (const [style, theme] of LOOKS) {
  test(`chips are plain notation: done dimmed, current highlighted (${style}-${theme})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1200, height: 900 });
    await gallery(page, style, theme);
    const sequences = {
      scramble: { length: 20, current: 'R′', currentIndex: 14 },
      tperm: { length: 14, current: 'R2', currentIndex: 6 },
      rotation: { length: 4, current: 'y′', currentIndex: 0 },
      wide: { length: 8, current: 'r', currentIndex: 0 },
      slice: { length: 3, current: 'M′', currentIndex: 0 },
    };
    for (const [id, want] of Object.entries(sequences)) {
      const section = page.locator(`[data-example="${id}"]`);
      const chips = section.locator('.mg-strip i');
      await expect(chips).toHaveCount(want.length);
      const current = section.locator('.mg-strip i.current');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute('data-index', String(want.currentIndex));
      await expect(current).toHaveText(want.current);
      expect(await chips.evaluateAll(list => list.map(i => i.className))).toEqual(
        Array.from({ length: want.length }, (_, i) => (i < want.currentIndex ? 'done' : i === want.currentIndex ? 'current' : '')));
      // no glyphs, direction words, finger markers or tooltips: only notation
      await expect(section.locator('svg, .mg-caption, .mg-stage, .mg-finger, [title]')).toHaveCount(0);
      const visible = await section.locator('.mg-strip').evaluate(strip => strip.innerText.replace(/\s+/g, ''));
      expect(visible).toMatch(/^[URFDLBMESxyzrw2′]+$/);
      // the accessible description stays (aria-label and a live region), but is not visible
      await expect(current).toHaveAttribute('aria-label', new RegExp(`^Move ${want.currentIndex + 1} of ${want.length}: `));
      await expect(section.locator('.mg-sr')).toHaveText(new RegExp(`^Move ${want.currentIndex + 1} of ${want.length}: `));
      expect(await section.locator('.mg-sr').evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    }
    // the current chip stands out: bigger than a plain one, and a different border colour
    const style1 = await page.evaluate(() => {
      const cs = selector => getComputedStyle(document.querySelector(selector));
      const cur = cs('[data-example="scramble"] .mg-strip i.current');
      const plain = cs('[data-example="scramble"] .mg-strip i:not(.current):not(.done)');
      const done = cs('[data-example="scramble"] .mg-strip i.done');
      return { curSize: parseFloat(cur.fontSize), plainSize: parseFloat(plain.fontSize), curBorder: cur.borderTopColor, plainBorder: plain.borderTopColor, doneOpacity: Number(done.opacity) };
    });
    expect(style1.curSize).toBeGreaterThan(style1.plainSize);
    expect(style1.curBorder).not.toBe(style1.plainBorder);
    expect(style1.doneOpacity).toBeLessThan(.6);
    expect(errors).toEqual([]);
  });
}

test('the cue pref turns the cue off and animateMove still works on all kinds', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  await page.evaluate(async () => {
    localStorage.setItem('cubesight-move-guide', JSON.stringify({ cue: false }));
    window.gallery.guides.scramble.update({ index: 3 });
  });
  await expect(page.locator('canvas')).not.toHaveAttribute('data-cue', /.*/);
  const done = await page.evaluate(async () => { const c = window.gallery.cube; await c.animateMove("M'", null, 30); await c.animateMove('x', null, 30); await c.animateMove('r', null, 30); return true; });
  expect(done).toBe(true);
});

test('move animation cancellation, reduced motion, and destroy settle their promises', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  const cancelled = await page.evaluate(async () => {
    const cube = window.gallery.cube;
    const animation = cube.animateMove('R', null, 1000);
    cube.update({});
    return Promise.race([animation.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 300))]);
  });
  expect(cancelled).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotion = await page.evaluate(async () => {
    const started = performance.now();
    await window.gallery.cube.animateMove('U', null, 1000);
    return performance.now() - started;
  });
  expect(reducedMotion).toBeLessThan(200);

  const destroyed = await page.evaluate(async () => {
    const cube = window.gallery.cube;
    const animation = cube.animateMove('F', null, 1000);
    cube.destroy();
    return Promise.race([animation.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 300))]);
  });
  expect(destroyed).toBe(true);
});
