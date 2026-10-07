import fs from 'node:fs';
import { test, expect } from './helpers/coverage-test.js';
import { GOLD } from './analysis-golden.mjs';
import { mountTestBrain, playSolve } from './helpers/fake-brain.js';
import { prepareScreenRecord, seedSolve, visualCell } from './helpers/seed-solve.js';
import { selectOrbitMarker } from './helpers/orbit-markers.js';

// The results review: coach markers on the shared Orbit (Mono keeps its lane), stage and marker
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

test('every skipped stage stays represented on the Orbit, and visible labels never overlap', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, GOLD.ollPllSkip.scramble, GOLD.ollPllSkip.moves, { brain: BRAIN, base: 80 });
  const brain = page.locator(BRAIN);
  await expect(brain.locator('.orbit__segment.is-skipped')).not.toHaveCount(0);
  const visible = brain.locator('.orbit__label');
  const skipped = await brain.locator('.orbit__segment.is-skipped').count();
  for (const segment of await brain.locator('.orbit__segment.is-skipped').all()) await expect(segment).toHaveAttribute('aria-label', /skip/);
  expect(skipped).toBeGreaterThan(1);
  await expect(visible).not.toHaveCount(0);
  const boxes = await page.evaluate(() => [...document.querySelectorAll('#brain-view .orbit__label')].map(n => ({ t: n.textContent, r: n.getBoundingClientRect() })).filter(b => b.r.width > 0));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      expect(overlap, `${boxes[i].t} × ${boxes[j].t}`).toBe(false);
    }
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  await brain.locator('.b-slot-timeline').screenshot({ path: `${SHOTS}/ring-many-skips.png` });   // the Orbit's box; .brain-stage is display: contents
  await testInfo.attach('ring-many-skips', { path: `${SHOTS}/ring-many-skips.png`, contentType: 'image/png' });
});

test('an x-cross shows its merged pairs as "merged", outside the deltas', async ({ page }) => {
  test.setTimeout(90_000);
  await mountTestBrain(page, 'orbit', { route: true });
  await playSolve(page, "B2 F2 R' F2 R B2 R' B'", "B R B2 R' F2 R F2 B2", { brain: BRAIN, base: 80 });
  const brain = page.locator(BRAIN);
  // Pairs built with the cross end together: the Orbit draws ONE label for the run ("p1·p2 with cross", A-05), on its first stage.
  await expect(brain.locator('[data-label-for=pair1] .orbit__label-value')).toHaveText('with cross');
  await expect(brain.locator('[data-label-for=pair1] .orbit__label-name')).toHaveText(/^p1·p2/);
  await expect(brain.locator('[data-label-for=pair2]')).toHaveCount(0);
  await expect(brain.locator('[data-label-for=pair1] .orbit__label-delta')).toHaveCount(0);
  await expect(brain.locator('.orbit__label', { hasText: '±0.00' })).toHaveCount(0);
  const tail = await brain.locator('.orbit__label').allTextContents();
  expect(tail.filter(t => /^(p\d|pair \d)\s*0\.00/.test(t.trim()) && /[−+-]\d/.test(t))).toEqual([]);
});

const VIEWS = [
  ['orbit-dark', 'orbit', 'dark', { width: 1440, height: 900 }],
  ['orbit-light', 'orbit', 'light', { width: 1440, height: 900 }],
  ['mono-dark', 'mono', 'dark', { width: 1440, height: 900 }],
  ['orbit-dark-phone', 'orbit', 'dark', { width: 390, height: 844 }],
];
async function goldenScreenRecord() {
  const solveMoves = g.moves.split(/\s+/);
  let elapsed = 0;
  const moveTimes = solveMoves.map((_, index) => (elapsed += index === 14 ? 1800 : 100));
  const record = await prepareScreenRecord({ at: 1700000000000, scramble: g.scramble,
    solveMoves, moveTimes, moveCount: solveMoves.length, solveMs: elapsed,
    crossFace: 'D', crossColor: 'white', focus: 'speed', source: 'smart', solved: true,
    config: { method: 'cfop', f2l: 'pseudo', oll: '2look', pll: '2look' } });
  const marks = record.analysis.marks;
  const ends = [marks.cross, ...marks.pairs, marks.eo, marks.co, marks.cp, marks.solved];
  let previous = -1;
  const keys = ['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep'];
  const splits = ends.map((end, index) => {
    const before = previous;
    previous = end;
    return { key: keys[index], moves: end - before, ms: moveTimes[end] - (moveTimes[before] || 0), skipped: end === before };
  });
  return { ...record, splits };
}

for (const style of ['orbit', 'mono']) {
  test(`results review screenshots: ${style} · all original cells`, async ({ page }, testInfo) => {
    // Screen rendering is the subject. Orbit uses the same F1 presenter on a
    // seeded past solve; the legacy Mono marker lane keeps one genuine flow.
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let brain, readReview;
    if (style === 'orbit') {
      const record = await goldenScreenRecord();
      await seedSolve(page, { record, style });
      await page.goto(`/#/history/${record.at}`);
      brain = page.locator('#history-view');
      await expect(brain.locator('.f1-results')).toBeVisible();
      readReview = () => page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.results.review);
    } else {
      await page.setViewportSize({ width: 1440, height: 900 });
      await mountTestBrain(page, style, { route: true });
      await playSolve(page, g.scramble, g.moves, { brain: BRAIN, base: 100, gaps: { 14: 1800 } });
      brain = page.locator(BRAIN);
      readReview = () => review(page);
      await expect(brain.locator('.b-rev-chip')).not.toHaveCount(0, { timeout: 30_000 });
      await expect(brain.locator('.m-mk')).not.toHaveCount(0);
      const marker = brain.locator('.m-mk:not(.is-selected)').first();
      const markerId = await marker.getAttribute('data-marker');
      await marker.click();
      await expect.poll(() => readReview().then(model => model.selectedId)).toBe(markerId);
      await expect(brain.locator(`.m-mk[data-marker="${markerId}"]`)).toHaveClass(/is-selected/);
      await expect(brain.locator('.m-tl-review-hint')).toHaveText('Select a marker to read its note');
      await page.keyboard.press('Escape');
    }
    fs.mkdirSync(SHOTS, { recursive: true });
    for (const [name, , theme, size] of VIEWS.filter(cell => cell[1] === style)) {
      await visualCell(page, { ...size, theme });
      await expect(brain.locator('canvas')).toHaveCount(1);
      await page.screenshot({ path: `${SHOTS}/${name}-results.png`, fullPage: true });
      const detour = (await readReview()).markers.find(marker => /detour/.test(marker.label));
      expect(detour).toBeTruthy();
      if (style === 'orbit') await selectOrbitMarker(brain, detour.id);
      else await brain.locator('.b-rev-chip', { hasText: 'detour' }).click();
      // A desktop shows the moment screen of frame A-06; a phone keeps the detail panel
      const moment = style === 'orbit' && size.width >= 900;
      if (moment) {
        await expect(brain.locator('.moment__badge')).toContainText('detour');
        await expect(brain.locator('.moment__count')).toContainText(/^move \d+ of \d+$/);
        await expect(brain.locator('.b-rev-detail')).toBeHidden();
        await page.screenshot({ path: `${SHOTS}/${name}-detail.png`, fullPage: true });
        await testInfo.attach(`${name}-results`, { path: `${SHOTS}/${name}-results.png`, contentType: 'image/png' });
        await page.keyboard.press('Escape');
        await expect(page).toHaveURL(/#\/history\/\d+$/);
        // Leaving the moment re-renders the past screen; wait for that before driving it again.
        await expect(brain.locator('.moment__badge')).toHaveCount(0);
      } else {
        await expect(brain.locator('.b-rev-detail')).toBeVisible();
        await expect(brain.locator('.b-rev-dtitle')).toContainText('detour');
        const statOverlap = await brain.locator('.b-rev-dstats > div').evaluateAll(nodes => nodes.some(node => {
          const label = node.querySelector('dt').getBoundingClientRect();
          const value = node.querySelector('dd').getBoundingClientRect();
          return label.left < value.right && value.left < label.right && label.top < value.bottom && value.top < label.bottom;
        }));
        expect(statOverlap, 'detail labels and values stay separate').toBe(false);
        await page.screenshot({ path: `${SHOTS}/${name}-detail.png`, fullPage: true });
        await testInfo.attach(`${name}-results`, { path: `${SHOTS}/${name}-results.png`, contentType: 'image/png' });
        if (style === 'orbit') {
          await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
          const cube = await brain.locator('.history-stage__cube').boundingBox();
          expect(cube.y).toBeGreaterThanOrEqual(-1);
          expect(cube.y + cube.height).toBeLessThanOrEqual(size.height + 1);
        }
        await page.keyboard.press('Escape');
        await expect(brain.locator('.b-rev-detail')).toBeHidden();
      }
      if (style === 'orbit') {
        await expect(brain.locator('.f1-results')).toBeVisible();
        await brain.locator('[data-segment=cross]').press('Enter');
        await expect(brain.locator('.b-rev-detail')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(brain.locator('.b-rev-detail')).toBeHidden();
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
    expect(errors).toEqual([]);
  });
}
