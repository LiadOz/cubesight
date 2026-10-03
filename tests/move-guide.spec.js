import { test, expect } from './helpers/coverage-test.js';
import fs from 'node:fs';

// The move guide (plain notation chips) and the 3D cue, through the dev gallery page
// (src/moves/_gallery.html). Screenshots go to test-results/move-guide/.
const SHOTS = 'test-results/move-guide';
const LOOKS = [['orbit', 'dark'], ['mono', 'light']];
const gallery = (page, style = 'orbit', theme = 'dark', extra = '') => page.goto(`/src/moves/_gallery.html?style=${style}&theme=${theme}${extra}`)
  .then(() => page.waitForSelector('html[data-gallery-ready]'));
const cueState = page => page.evaluate(() => window.gallery.cube.getCueState());
const cueAngle = page => cueState(page).then(state => state?.angle ?? 0);

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
    fs.mkdirSync(SHOTS, { recursive: true });
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
    await page.screenshot({ path: `${SHOTS}/${style}-${theme}-chips.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('the cue targets the current move: layer, axis, direction and angle', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-cue', "R'");
  await expect(canvas).toHaveAttribute('data-cue-loop', 'true');
  // [move, physical layer, axis, sign of the angle about that axis (right-handed), peak degrees]
  const table = [
    ['R', 'R', [1, 0, 0], -1, 36], ["R'", 'R', [1, 0, 0], 1, 36], ['U', 'U', [0, 1, 0], -1, 36], ["U'", 'U', [0, 1, 0], 1, 36],
    ['F', 'F', [0, 0, 1], -1, 36], ['F2', 'F', [0, 0, 1], -1, 60], ["L'", 'L', [-1, 0, 0], -1, 36], ['D', 'D', [0, 1, 0], 1, 36],
    ["M'", 'M', [-1, 0, 0], -1, 36], ['r', 'R', [1, 0, 0], -1, 36], ['y', 'y', [0, 1, 0], -1, 30],
  ];
  for (const [move, layer, axis, sign, peak] of table) {
    const state = await page.evaluate(m => { const c = window.gallery.cube; c.setCue(m, { pose: 1 }); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(c.getCueState())))); }, move);
    expect(state.move, move).toBe(move);
    expect(state.layer, move).toBe(layer);
    expect(state.axis.map(Math.abs), move).toEqual(axis.map(Math.abs));
    expect(Math.sign(state.angle), `${move} sign`).toBe(sign);
    expect(Math.abs(state.angle), `${move} peak`).toBe(peak);
    expect(state.active).toBe(true);
  }
  // layers: a wide move turns two layers, a slice the middle one
  const layers = async move => page.evaluate(m => { const c = window.gallery.cube; c.setCue(m, { pose: 0 }); return c.getCueState().layers; }, move);
  expect(await layers('r')).toEqual([0, 1]);
  expect(await layers("M'")).toEqual([0]);
  expect(await layers('R')).toEqual([1]);
});

test('the looping cue eases out, holds, returns to rest and repeats; doubles go twice', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  const sample = async (move, ms) => page.evaluate(async ([m, total]) => {
    const c = window.gallery.cube; c.setCue(m);
    const out = []; const t0 = performance.now();
    while (performance.now() - t0 < total) { out.push(Math.round(c.getCueState().angle)); await new Promise(resolve => setTimeout(resolve, 25)); }
    return out;
  }, [move, ms]);
  const quarter = await sample("U'", 3600);   // U' is a positive angle
  expect(quarter[0]).toBe(0);
  expect(Math.max(...quarter)).toBeGreaterThanOrEqual(30);
  expect(Math.min(...quarter)).toBe(0);
  expect(quarter.every(angle => angle >= 0 && angle <= 36)).toBe(true);
  const double = await sample('F2', 4200);
  expect(Math.min(...double)).toBeGreaterThanOrEqual(-60);
  expect(Math.max(...double.map(Math.abs))).toBeGreaterThanOrEqual(55);
  // two separate excursions to the peak within one cycle
  const absd = double.map(Math.abs);
  let excursions = 0; let above = false;
  for (const v of absd) { if (v >= 50 && !above) { excursions++; above = true; } else if (v < 20) above = false; }
  expect(excursions).toBeGreaterThanOrEqual(2);
});

test('a physical turn cancels the cue at once, the real turn animates, then the cue restarts on the next move', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  await expect(page.locator('canvas')).toHaveAttribute('data-cue', "R'");
  // let the cue get going
  await expect.poll(() => cueAngle(page)).not.toBe(0);
  const log = await page.evaluate(async () => {
    const { createSolvedState, toRenderData } = await import('/src/cross-cube.js');
    const cube = window.gallery.cube;
    const canvas = document.querySelector('canvas');
    const trace = [];
    const snap = label => trace.push({ label, cue: canvas.dataset.cue ?? null, turning: canvas.dataset.turningFace ?? null, ...(({ active, angle }) => ({ active, angle }))(cube.getCueState()) });
    cube.queueLiveMove("R'", toRenderData(createSolvedState()));
    snap('right after the physical turn arrives');
    // the guide hands the cue to the next move while the real turn is still animating
    window.gallery.guides.scramble.update({ index: 15 });
    snap('next move set during the real turn');
    await new Promise(resolve => requestAnimationFrame(resolve));
    snap('mid real turn');
    await new Promise(resolve => setTimeout(resolve, 600));
    snap('after the real turn');
    await new Promise(resolve => setTimeout(resolve, 1200));
    snap('cue running again');
    return trace;
  });
  const by = Object.fromEntries(log.map(entry => [entry.label, entry]));
  expect(by['right after the physical turn arrives']).toMatchObject({ cue: null, active: false, angle: 0, turning: 'R' });
  expect(by['next move set during the real turn']).toMatchObject({ cue: null, active: false, angle: 0 });
  expect(by['mid real turn']).toMatchObject({ cue: null, active: false, turning: 'R' });
  expect(by['after the real turn'].turning).toBeNull();
  // the cue came back for the NEXT move (index 15 is D2), after the real turn finished
  const after = await cueState(page);
  expect(after.move).toBe('D2');
  expect(after.active).toBe(true);
  await expect(page.locator('canvas')).toHaveAttribute('data-cue', 'D2');
  await expect.poll(() => cueAngle(page)).not.toBe(0);
});

test('a wrong turn hands the cue to the first recovery move', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-cue', "R'");
  // the brain drops the plan guide's cube and gives it to the recovery guide
  await page.evaluate(() => {
    const { cube, guides } = window.gallery;
    const host = document.createElement('div');
    document.body.append(host);
    window.recovery = window.gallery.createMoveGuide(host, { moves: ["L'", 'U2'], index: 0, held: { bottom: 'D', front: 'F' }, cube3d: null });
    guides.scramble.update({ cube3d: null, statuses: { 14: 'wrong' } });
    window.recovery.update({ cube3d: cube });
  });
  await expect(canvas).toHaveAttribute('data-cue', "L'");
  expect((await cueState(page)).layer).toBe('L');
  await page.evaluate(() => window.recovery.update({ index: 1 }));
  await expect(canvas).toHaveAttribute('data-cue', 'U2');
  // recovered: the plan takes the cue back, the recovery strip lets go of it
  await page.evaluate(() => {
    window.gallery.guides.scramble.update({ cube3d: window.gallery.cube, statuses: {} });
    window.recovery.update({ moves: [], index: -1, cube3d: null });
  });
  await expect(canvas).toHaveAttribute('data-cue', "R'");
});

test('held orientation: an explicit hold fixes the colour layer, the gyro re-orients it in the world; with no hold the cue follows the gyro', async ({ page }) => {
  await gallery(page, 'orbit', 'dark', '&cue=1');
  const pose = (move, held) => page.evaluate(async ([m, h]) => {
    const c = window.gallery.cube;
    c.setCue(m, { pose: 1, held: h });
    await new Promise(resolve => setTimeout(resolve, 400));
    return c.getCueState();
  }, [move, held]);
  const quat = async (x, y, z, w) => page.evaluate(([qx, qy, qz, qw]) => { window.gallery.cube.setGyroOrientation({ x: qx, y: qy, z: qz, w: qw }); }, [x, y, z, w]);
  // no gyro yet: R is the red layer about +x, in the world as well
  let state = await pose('R', null);
  expect([state.layer, state.worldAxis[0]]).toEqual(['R', 1]);
  // a quarter turn of the cube about the vertical: explicit hold keeps the red layer, its world axis moves
  const h = Math.SQRT1_2;
  await quat(0, 0, 0, 1);            // the reference pose
  await quat(0, h, 0, h);            // then the cube turned 90 degrees
  await page.waitForTimeout(800);
  const fixed = await pose('R', { bottom: 'D', front: 'F' });
  expect(fixed.layer).toBe('R');
  expect(Math.abs(fixed.worldAxis[0])).toBeLessThan(.2);
  expect(Math.hypot(...fixed.worldAxis)).toBeGreaterThan(.99);
  expect(fixed.worldAxis).not.toEqual(state.worldAxis);
  // following the gyro: "R" now means whichever face is on the viewer's right, so the world axis stays
  const follow = await pose('R', null);
  expect(follow.layer).not.toBe('R');
  expect(follow.worldAxis[0]).toBeGreaterThan(.9);
  expect(Math.sign(follow.angle)).toBe(-1);
});

test('reduced motion: a static tinted layer with a small still offset, no loop', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gallery(page, 'orbit', 'dark', '&cue=1');
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-cue', "R'");
  await expect(canvas).toHaveAttribute('data-cue-loop', 'false');
  const a = await cueAngle(page);
  await page.waitForTimeout(600);
  const b = await cueAngle(page);
  expect(a).toBe(b);
  expect(Math.abs(a)).toBeGreaterThan(5);
  expect(Math.abs(a)).toBeLessThan(25);
});

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
  await gallery(page, 'orbit', 'dark');
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

// Screenshots of the cue at rest, mid-turn and at its peak for the moves the brief asks
// about, in both priority looks. Read them to check the directions against notation.
for (const [style, theme] of LOOKS) {
  test(`cue screenshots (${style}-${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    fs.mkdirSync(`${SHOTS}/cue`, { recursive: true });
    await page.setViewportSize({ width: 900, height: 700 });
    await gallery(page, style, theme, '&cue=1');
    await page.evaluate(() => {
      const mount = document.querySelector('canvas').parentElement;
      mount.style.cssText = 'position:fixed;left:50%;top:50%;width:560px;height:560px;transform:translate(-50%,-50%)';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(300);
    for (const move of ['R', "U'", 'F2', "M'", 'y', 'r']) {
      for (const [name, pose] of [['0', 0], ['mid', .5], ['peak', 1]]) {
        await page.evaluate(([m, p]) => window.gallery.cube.setCue(m, { pose: p, held: { bottom: 'D', front: 'F' } }), [move, pose]);
        await page.waitForTimeout(250);
        const box = await page.locator('canvas').boundingBox();
        await page.screenshot({ clip: box, path: `${SHOTS}/cue/${style}-${theme}-${move.replace("'", 'p').replace(/^r$/, 'rw')}-${name}.png` });
      }
    }
  });
}
