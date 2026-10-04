import { expect } from 'playwright/test';
import { mountTestBrain } from '../helpers/fake-brain.js';

export async function mountFakeCube(page, { delayed = false } = {}) {
  await mountTestBrain(page, 'orbit', { route: true, awaitConnect: !delayed, deferConnect: delayed });
  await expect(page.locator('#brain-view .brain')).toHaveAttribute('data-brain-style', 'orbit');
  await page.evaluate(() => document.fonts.ready);
}

export async function startScramble(page, scramble = "R2 D' F2 U B2 L' U2 F") {
  const brain = page.locator('#brain-view');
  await brain.locator('.brain-pill-setup > summary').click();
  await brain.locator('.brain-advanced-scramble > summary').click();
  await brain.locator('#brain-scramble').fill(scramble);
  await brain.locator('#brain-start-custom').click();
  return scramble;
}

export async function completeScramble(page, scramble) {
  await page.evaluate(moves => window.testBrain.emitTurns(moves), scramble);
  // Snapshot captures must resolve the real cross suggestion before a move
  // leaves inspection; later phases no longer expose that asynchronous hint.
  if (await page.evaluate(() => Boolean(window.__cubesightSnapshotReplayClock))) {
    await expect.poll(() => page.evaluate(() => window.__cubesightSnapshot?.getViewModel()?.viewModel?.inspection?.bestStart), { timeout: 10000 }).toBeTruthy();
  }
}

export async function solveReverse(page, scramble) {
  const solution = scramble.split(/\s+/).reverse().map(move => {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move[0] : `${move}'`;
  }).join(' ');
  await page.evaluate(moves => window.testBrain.emitTurns(moves), solution);
  return solution;
}
