import { test, expect } from './helpers/coverage-test.js';
import { seedSolve } from './helpers/seed-solve.js';
import { GOLD } from './analysis-golden.mjs';

// Highlighting on REAL screens (not a direct Cube.highlight() call): the pieces a stage or case is about stay vivid
// and caged, the other stickers dim. cube-3d publishes what it drew on the canvas: highlightedPieces (cubicle names),
// highlightedStickers / dimmedStickers (counts out of 54 stickers: 6 centres, 12 edges x 2, 8 corners x 3).

const stickers = async (page, selector) => page.locator(`${selector} canvas`).first().evaluate(canvas => ({
  pieces: canvas.dataset.highlightedPieces.split(',').filter(Boolean).sort(),
  highlighted: Number(canvas.dataset.highlightedStickers), dimmed: Number(canvas.dataset.dimmedStickers), cages: Number(canvas.dataset.highlightCages),
}));

const record = {
  at: 1700000000000, scramble: GOLD.normal.scramble, solveMs: 14000, penalty: null, focus: 'speed', source: 'smart', solved: true,
  solveMoves: GOLD.normal.moves.split(' '), moveCount: GOLD.normal.moves.split(' ').length,
  moveTimes: GOLD.normal.moves.split(' ').map((_, index) => (index + 1) * 140),
};

test('review: a cross moment emphasises the four cross edges and a last-layer moment the last layer', async ({ page }) => {
  await seedSolve(page, { record });
  await page.goto(`/#/history/${record.at}`);
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot?.getViewModel()?.viewModel?.selected?.markers?.length ?? 0)).toBeGreaterThan(0);
  const markers = await page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.selected.markers.map(({ id, stage }) => ({ id, stage })));
  const cross = markers.find(item => item.stage === 'cross'), lastLayer = markers.find(item => ['eo', 'co', 'cp', 'ep', 'oll', 'pll'].includes(item.stage));
  expect(cross, 'a cross moment').toBeTruthy();
  await page.goto(`/#/history/${record.at}/review/${encodeURIComponent(cross.id)}`);
  // the cross: four edges, 8 stickers; the other 46 dim
  await expect.poll(() => stickers(page, '.history-stage__cube')).toMatchObject({ highlighted: 8, dimmed: 46, cages: 4 });
  const edges = await stickers(page, '.history-stage__cube');
  expect(edges.pieces).toHaveLength(4);
  expect(edges.pieces.every(name => name.length === 2)).toBe(true);
  if (lastLayer) {
    await page.goto(`/#/history/${record.at}/review/${encodeURIComponent(lastLayer.id)}`);
    // the last layer: four edges and four corners, 20 stickers
    await expect.poll(() => stickers(page, '.history-stage__cube')).toMatchObject({ highlighted: 20, dimmed: 34, cages: 8 });
  }
  // and the plain solve and the replay show the whole cube, as the approved frames do
  await page.goto(`/#/history/${record.at}/replay`);
  await expect.poll(() => stickers(page, '.history-stage__cube')).toMatchObject({ highlighted: 0, dimmed: 0 });
});

test('review: a pair moment emphasises that pair (corner and edge, and the slot) and dims the rest', async ({ page }) => {
  await seedSolve(page, { record });
  await page.goto(`/#/history/${record.at}`);
  await expect(page.locator('.history-stage__cube canvas')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot?.getViewModel()?.viewModel?.selected?.markers?.length ?? 0)).toBeGreaterThan(0);
  const marker = await page.evaluate(() => window.__cubesightSnapshot.getViewModel().viewModel.selected.markers.find(item => /^pair\d$/.test(item.stage)));
  test.skip(!marker, 'the analysed record has no pair moment');
  await page.goto(`/#/history/${record.at}/review/${encodeURIComponent(marker.id)}`);
  // the pair is a corner (3 stickers) and an edge (2); when it is not yet in its slot the slot's own cubicles are caged too
  await expect.poll(async () => { const { highlighted, dimmed } = await stickers(page, '.history-stage__cube'); return highlighted >= 5 && highlighted <= 10 && highlighted + dimmed === 54; }).toBe(true);
});

test('algs: an F2L case highlights its corner and edge plus the slot they belong in', async ({ page }) => {
  await page.goto('/#/algs/f2l/1');
  await expect(page.locator('[data-alg-cube] canvas')).toBeVisible();
  await expect.poll(() => stickers(page, '[data-alg-cube]')).toMatchObject({ dimmed: expect.any(Number) });
  const result = await stickers(page, '[data-alg-cube]');
  expect(result.pieces.length, 'the pair plus its slot').toBeGreaterThanOrEqual(2);
  expect(result.pieces.length).toBeLessThanOrEqual(4);
  expect(result.dimmed).toBeGreaterThan(30);
});

test('algs: an OLL case highlights the last layer and dims the first two layers', async ({ page }) => {
  await page.goto('/#/algs/oll/1');
  await expect(page.locator('[data-alg-cube] canvas')).toBeVisible();
  await expect.poll(() => stickers(page, '[data-alg-cube]')).toMatchObject({ highlighted: 20, dimmed: 34 });
});

test('drills: OLL and PLL (a corner-mode cube) highlight the last layer', async ({ page }) => {
  await page.goto('/#/drills/oll');
  await expect(page.locator('#oll-cube canvas')).toBeVisible();
  await expect.poll(() => stickers(page, '#oll-cube')).toMatchObject({ highlighted: 20, dimmed: 34 });
  await page.goto('/#/drills/pll');
  await expect(page.locator('#pll-cube canvas')).toBeVisible();
  // the PLL cube is built in corner mode, which used to ignore every highlight
  await expect(page.locator('#pll-cube canvas')).toHaveAttribute('data-interaction-mode', 'corner');
  await expect.poll(() => stickers(page, '#pll-cube')).toMatchObject({ highlighted: 20, dimmed: 34 });
});
