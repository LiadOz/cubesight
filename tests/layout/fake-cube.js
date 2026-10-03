import { mountTestBrain } from '../helpers/fake-brain.js';

export async function mountFakeCube(page, { delayed = false } = {}) {
  await mountTestBrain(page, 'orbit', { route: true, awaitConnect: !delayed, deferConnect: delayed });
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
}

export async function solveReverse(page, scramble) {
  const solution = scramble.split(/\s+/).reverse().map(move => {
    if (move.endsWith('2')) return move;
    return move.endsWith("'") ? move[0] : `${move}'`;
  }).join(' ');
  await page.evaluate(moves => window.testBrain.emitTurns(moves), solution);
  return solution;
}
