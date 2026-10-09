import { test, expect } from './helpers/coverage-test.js';
import { GOLD } from './analysis-golden.mjs';
import { mountTestBrain, playSolve } from './helpers/fake-brain.js';
import { selectOrbitMarker } from './helpers/orbit-markers.js';

// The results review: coach markers on the shared Orbit (Mono keeps its lane), stage and marker
// detail with the real cube jumping to the position, "yours vs better" animated, pins that persist.
// The solve is the golden "normal" solve with a 1.8 s stop before move 15 and a detour in the cross.
// Marker, detail, pin and Orbit-label logic are unit-tested (review-*-unit, brain-view-model-unit).
const g = GOLD.normal;
const BRAIN = '#brain-view';

const pinsInDb = page => page.evaluate(async () => {
  const backend = await (await import('/src/store/idb.js')).openIdbBackend();
  const pins = await backend.getPins();
  await backend.close();
  return pins;
});


const review = page => page.evaluate(() => window.testBrain.handle.getViewModel().results.review);
const ringMarkerKeys = brain => brain.locator('[data-marker-keys]').evaluateAll(nodes => nodes.flatMap(node => JSON.parse(node.dataset.markerKeys)).sort());

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
  await expect.poll(() => ringMarkerKeys(brain)).toEqual((await review(page)).markers.map(marker => marker.id).sort());
  // F1 removes the duplicate TPS chart; all its moments remain on the Orbit.
  await expect(brain.locator('.b-ch-markers')).toHaveCount(0);
  // Not a list: one coach card with the selected (most costly) marker's note.
  await expect(brain.locator('.f1-results__coach .ui-coach-line__text')).toHaveCount(1);
  await expect(brain.locator('.b-rev-chip.is-selected')).toHaveCount(1);
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('0');
  expect(await brain.locator('.b-rev-chip.is-prominent').count()).toBeGreaterThan(0);

  // Tap the detour: detail opens, the cube shows the position before that move.
  await selectOrbitMarker(brain, (await review(page)).markers.find(marker => /detour/.test(marker.label)).id);
  const detail = brain.locator('.b-rev-detail');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.b-rev-dtitle')).toContainText('detour');
  await expect(detail.locator('.b-rev-dcmp-text')).toHaveText('yours 5 · better 3');
  expect((await review(page)).detail.cursor).toBe(3);
  const cubeCanvas = await page.evaluate(() => document.querySelector('#brain-cube canvas')?.toDataURL().length ?? 0);
  expect(cubeCanvas).toBeGreaterThan(0);

  // A move chip jumps the cube; "better" animates the shorter cross on it.
  await detail.locator('.b-rev-mv[data-at="5"]').click();
  expect((await review(page)).detail.cursor).toBe(5);
  await detail.locator('.b-rev-variant[data-variant="better"]').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#brain-cube canvas')?.dataset.turningFace ?? ''), { timeout: 5000 }).not.toBe('');
  await expect(detail.locator('.b-rev-variant[data-variant="better"]')).toHaveClass(/is-active/);
  await expect(detail.locator('.b-rev-alg-better code')).toContainText("R D′ F");

  // A stage opens too: its stats and the pair 3 completion suggestion.
  await brain.locator('[data-segment=pair3]').press('Enter');
  await expect(detail.locator('.b-rev-dtitle')).toHaveText('pair 3');
  await expect(detail.locator('.b-rev-dcmp-text')).toContainText('better');
  await expect(detail.locator('.b-rev-variant[data-variant="better"]')).toBeVisible();
  await brain.locator('[data-segment=cross]').press('Enter');
  await expect(detail.locator('.b-rev-dcmp-text')).toContainText('yours 8 · better 6');

  // Pin the cross, see the counter, unpin, pin again.
  await detail.locator('.b-rev-pin-detail').click();
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('1');
  await expect(detail.locator('.b-rev-pin-detail')).toHaveText('pinned · unpin');
  await detail.locator('.b-rev-pin-detail').click();
  await expect(brain.locator('.b-rev-pin-count')).toHaveText('0');
  await detail.locator('.b-rev-pin-detail').click();
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
