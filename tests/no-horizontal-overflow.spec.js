import { test, expect } from './helpers/coverage-test.js';
import { seedSolve } from './helpers/seed-solve.js';
import { GOLD } from './analysis-golden.mjs';

// "No horizontal scroll" is a product rule. A 95-move solve once ran ~4000 px off screen on the old review page
// (document.scrollWidth 5370 at a 1440 viewport) because .sequence-player had no width bound; nothing measured it.
// Every route, at the three widths the layout is designed for, must keep document.scrollWidth <= innerWidth.

const moves = GOLD.normal.moves.split(' ');
const record = {
  at: 1700000000000, scramble: GOLD.normal.scramble, solveMs: 14000, penalty: null, focus: 'speed', source: 'smart', solved: true,
  solveMoves: moves, moveCount: moves.length, moveTimes: moves.map((_, index) => (index + 1) * 140),
};

const ROUTES = [
  '/solve', '/drills', '/drills/corners', '/drills/pll', '/drills/f2l', '/drills/scout', '/drills/oll', '/drills/lookahead',
  '/algs', '/algs/pll', '/algs/oll', '/algs/f2l', '/algs/pll/H', '/algs/f2l/1', '/progress', '/timer', '/help', '/not-found',
  '/history', `/history/${record.at}`, `/history/${record.at}/replay`, `/history/${record.at}/review/pause-0`, '/history/import', '/review/import', `/review/${record.at}`,
];

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`no route scrolls sideways at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await seedSolve(page, { record });
    await page.goto('/#/solve');
    const offenders = [];
    for (const route of ROUTES) {
      await page.evaluate(hash => { location.hash = hash; }, `#${route}`);
      await page.waitForTimeout(450);
      const width = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
      if (width > 0) offenders.push(`${route} overflows by ${width}px`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
}

test('a long sequence scrolls inside its own strip instead of widening the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/help');
  const result = await page.evaluate(async longMoves => {
    const [{ createSequencePlayer }, { createSolvedState }] = await Promise.all([import('/src/moves/sequence-player.js'), import('/src/cross-cube.js')]);
    const host = document.createElement('section'); document.querySelector('main').append(host);
    createSequencePlayer(host, { moves: longMoves, startState: createSolvedState(), label: 'a 95-move solve' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const strip = host.querySelector('.mg-strip');
    return {
      page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      player: host.getBoundingClientRect().width, stripScrolls: strip ? strip.scrollWidth > strip.clientWidth : null,
    };
  }, moves);
  expect(result.stripScrolls, 'the 95 moves really are wider than the player').toBe(true);
  expect(result.page).toBeLessThanOrEqual(0);
  expect(result.player).toBeLessThanOrEqual(1200);
});
