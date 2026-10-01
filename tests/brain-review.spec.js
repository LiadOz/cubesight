import fs from 'node:fs';
import { test, expect } from 'playwright/test';
import { GOLD } from './analysis-golden.mjs';
import { mountTestBrain, playSolve } from './helpers/fake-brain.js';

// The results review: coach markers on the ring, the lane and the TPS chart, stage and marker
// detail with the real cube jumping to the position, "yours vs better" animated, pins that persist.
// The solve is the golden "normal" solve with a 1.8 s stop before move 15 and a detour in the cross.
const g = GOLD.normal;
const BRAIN = '#brain-view';
const SHOTS = 'test-results/brain-review';   // never write into docs/ from a test run

const pinsInDb = page => page.evaluate(async () => {
  const backend = await (await import('/src/store/idb.js')).openIdbBackend();
  const pins = await backend.getPins();
  await backend.close();
  return pins;
});

test('finish a solve: markers appear, a marker opens the detail with the cube there, better animates, pin persists', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, g.scramble, g.moves, { brain: BRAIN, base: 100, gaps: { 14: 1800 } });
  const brain = page.locator(BRAIN);

  // The analysis runs in a worker; the markers arrive a moment after the results.
  await expect(brain.locator('.b-rev-chip')).not.toHaveCount(0, { timeout: 30_000 });
  await expect(brain.locator('.b-oring-markers .b-mk')).not.toHaveCount(0);
  await expect(brain.locator('.b-ch-markers .b-mk')).not.toHaveCount(0);
  const chipCount = await brain.locator('.b-rev-chip').count();
  expect(await brain.locator('.b-oring-markers .b-mk').count()).toBe(chipCount);
  // Not a list: one coach card with the selected (most costly) marker's note.
  await expect(brain.locator('.b-rev-note')).toHaveCount(1);
  await expect(brain.locator('.b-rev-chip.is-selected')).toHaveCount(1);
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('0');
  expect(await brain.locator('.b-rev-chip.is-prominent').count()).toBeGreaterThan(0);

  // Tap the detour: detail opens, the cube shows the position before that move.
  await brain.locator('.b-rev-chip', { hasText: 'detour' }).click();
  const detail = brain.locator('.b-rev-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.b-rev-dtitle')).toContainText('detour');
  await expect(detail.locator('.b-rev-dcmp-text')).toHaveText('yours 5 · better 3');
  const review = () => page.evaluate(() => window.testBrain.handle.getViewModel().results.review);
  expect((await review()).detail.cursor).toBe(3);
  const cubeCanvas = await page.evaluate(() => document.querySelector('#brain-cube canvas')?.toDataURL().length ?? 0);
  expect(cubeCanvas).toBeGreaterThan(0);

  // A move chip jumps the cube; "better" animates the shorter cross on it.
  await detail.locator('.b-rev-mv[data-at="5"]').click();
  expect((await review()).detail.cursor).toBe(5);
  await detail.locator('.b-rev-variant[data-variant="better"]').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#brain-cube canvas')?.dataset.turningFace ?? ''), { timeout: 5000 }).not.toBe('');
  await expect(detail.locator('.b-rev-variant[data-variant="better"]')).toHaveClass(/is-active/);
  await expect(detail.locator('.b-rev-alg-better code')).toContainText("R D′ F");

  // A stage opens too: its stats and the pair 3 completion suggestion.
  await brain.locator('.b-ch-split-label', { hasText: 'pair 3' }).click();
  await expect(detail.locator('.b-rev-dtitle')).toHaveText('pair 3');
  await expect(detail.locator('.b-rev-dcmp-text')).toContainText('better');
  await expect(detail.locator('.b-rev-variant[data-variant="better"]')).toBeVisible();
  await brain.locator('.b-ch-split-label', { hasText: /^cross$/ }).click();
  await expect(detail.locator('.b-rev-dcmp-text')).toContainText('yours 8 · better 6');

  // Pin the cross, see the counter, unpin, pin again.
  await detail.locator('.b-rev-pin').click();
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('1');
  await expect(detail.locator('.b-rev-pin')).toHaveText('pinned · unpin');
  await detail.locator('.b-rev-pin').click();
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('0');
  await detail.locator('.b-rev-pin').click();
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('1');
  await expect.poll(async () => (await pinsInDb(page)).length).toBe(1);
  const [pin] = await pinsInDb(page);
  expect(pin).toMatchObject({ stage: 'cross', trainer: 'cross', moveIdx: 0, scramble: g.scramble, crossFace: 'D', kind: 'stage' });
  expect(pin.better.length).toBe(6);
  expect(pin.yours.length).toBe(8);

  // esc closes the detail and puts the real cube back.
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  expect(errors).toEqual([]);

  // Reload: the pin is still there and the next results screen counts it.
  await page.reload();
  expect((await pinsInDb(page)).length).toBe(1);
  await mountTestBrain(page, 'orbit', { route: true, keepStorage: true });
  await playSolve(page, g.scramble, g.moves, { brain: BRAIN, base: 60 });
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('many skips at once share one ring label, and the labels never overlap', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, GOLD.ollPllSkip.scramble, GOLD.ollPllSkip.moves, { brain: BRAIN, base: 80 });
  const brain = page.locator(BRAIN);
  await expect(brain.locator('.b-oring-seg.is-skipped')).not.toHaveCount(0);
  const visible = brain.locator('.b-oring-label:not(.is-grouped)');
  await expect(visible.filter({ hasText: /·.*skip$/ })).toHaveCount(1);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#brain-view .b-oring-label:not(.is-grouped)')].map(n => ({ t: n.textContent, r: n.getBoundingClientRect() })).filter(b => b.r.width > 0));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      expect(overlap, `${boxes[i].t} × ${boxes[j].t}`).toBe(false);
    }
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  await brain.locator('.brain-stage').screenshot({ path: `${SHOTS}/ring-many-skips.png` });
  await testInfo.attach('ring-many-skips', { path: `${SHOTS}/ring-many-skips.png`, contentType: 'image/png' });
});

test('an x-cross shows its merged pairs as "merged", outside the deltas', async ({ page }) => {
  test.setTimeout(90_000);
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, "B2 F2 R' F2 R B2 R' B'", "B R B2 R' F2 R F2 B2", { brain: BRAIN, base: 80 });
  const brain = page.locator(BRAIN);
  await expect(brain.locator('.b-ch-split[data-key="pair1"] .b-ch-split-value')).toHaveText('merged');
  await expect(brain.locator('.b-ch-split[data-key="pair2"] .b-ch-split-value')).toHaveText('merged');
  await expect(brain.locator('.b-ch-split[data-key="pair1"] .b-ch-split-delta')).toHaveText('');
  await expect(brain.locator('.b-ch-split[data-key="pair2"] .b-ch-split-delta')).toHaveText('');
  await expect(brain.locator('.b-oring-label.is-done', { hasText: '±0.00' })).toHaveCount(0);
  const tail = await brain.locator('.b-oring-label').allTextContents();
  expect(tail.filter(t => /^(p\d|pair \d)\s*0\.00/.test(t.trim()) && /[−+-]\d/.test(t))).toEqual([]);
});

const VIEWS = [
  ['orbit-dark', 'orbit', 'dark', { width: 1440, height: 900 }],
  ['orbit-light', 'orbit', 'light', { width: 1440, height: 900 }],
  ['mono-dark', 'mono', 'dark', { width: 1440, height: 900 }],
  ['orbit-dark-phone', 'orbit', 'dark', { width: 390, height: 844 }],
];
for (const [name, style, theme, size] of VIEWS) {
  test(`results review screenshot: ${name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize(size);
    await page.emulateMedia({ colorScheme: theme });
    await mountTestBrain(page, style, { route: true });
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await playSolve(page, g.scramble, g.moves, { brain: BRAIN, base: 100, gaps: { 14: 1800 } });
    const brain = page.locator(BRAIN);
    await expect(brain.locator('.b-rev-chip')).not.toHaveCount(0, { timeout: 30_000 });
    if (style === 'mono') await expect(brain.locator('.m-mk')).not.toHaveCount(0);
    await page.waitForTimeout(800);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}-results.png`, fullPage: true });
    await brain.locator('.b-rev-chip', { hasText: 'detour' }).click();
    await expect(brain.locator('.b-rev-detail')).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/${name}-detail.png`, fullPage: true });
    await testInfo.attach(`${name}-results`, { path: `${SHOTS}/${name}-results.png`, contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}
