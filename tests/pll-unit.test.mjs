import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLL_ANSWER_CHOICES,
  PLL_CASES,
  PLL_CASE_NAMES,
  generatePllCase,
  identifyPllCase,
  isPllState,
} from '../src/pll-logic.js';
import { createSolvedState } from '../src/cross-cube.js';
import { applyPllMoves } from '../src/pll-logic.js';

const solved = createSolvedState();
const solvedById = new Map(solved.cubies.map((cubie) => [cubie.id, cubie]));
const sameCubie = (a, b) => JSON.stringify(a.position) === JSON.stringify(b.position)
  && JSON.stringify(a.stickers) === JSON.stringify(b.stickers);

test('PLL metadata contains exactly the 21 uniquely named standard cases', () => {
  assert.equal(PLL_CASES.length, 21);
  assert.equal(new Set(PLL_CASE_NAMES).size, 21);
  assert.deepEqual(PLL_CASE_NAMES, [
    'Aa', 'Ab', 'E', 'F', 'Ga', 'Gb', 'Gc', 'Gd', 'H', 'Ja', 'Jb',
    'Na', 'Nb', 'Ra', 'Rb', 'T', 'Ua', 'Ub', 'V', 'Y', 'Z',
  ]);
  assert.equal(PLL_ANSWER_CHOICES.length, 21);
  assert.ok(PLL_CASES.every((entry) => entry.family && entry.category && entry.cue && entry.algorithm));
});

test('each generated case is a valid oriented-last-layer state with solved lower layers', () => {
  for (const entry of PLL_CASES) {
    const prompt = generatePllCase(entry.name, { auf: '' });
    assert.equal(isPllState(prompt.state), true, entry.name);
    for (const cubie of prompt.state.cubies.filter((piece) => piece.id.length > 1 && !piece.id.includes('U'))) {
      assert.equal(sameCubie(cubie, solvedById.get(cubie.id)), true, `${entry.name}: ${cubie.id}`);
    }
    for (const cubie of prompt.state.cubies.filter((piece) => piece.position[1] === 1 && piece.id.length > 1)) {
      assert.equal(cubie.stickers.U, 'white', `${entry.name}: top orientation`);
    }
    assert.deepEqual(applyPllMoves(prompt.state, entry.moves), solved, `${entry.name}: algorithm solves setup`);
  }
});

const topPieceMap = (state, slots) => Object.fromEntries(slots.map((slot) => {
  const [x, y, z] = slot.includes('U')
    ? [slot.includes('R') ? 1 : slot.includes('L') ? -1 : 0, 1, slot.includes('F') ? 1 : slot.includes('B') ? -1 : 0]
    : [slot.includes('R') ? 1 : slot.includes('L') ? -1 : 0, 1, slot.includes('F') ? 1 : slot.includes('B') ? -1 : 0];
  const piece = state.cubies.find((cubie) => cubie.position[0] === x && cubie.position[1] === y && cubie.position[2] === z);
  return [slot, piece?.id];
}));

test('key PLL names have their expected independent permutation structure', () => {
  const corners = ['UFR', 'UBR', 'UBL', 'UFL'];
  const edges = ['UF', 'UR', 'UB', 'UL'];
  const solvedCorners = Object.fromEntries(corners.map((slot) => [slot, slot]));
  const solvedEdges = Object.fromEntries(edges.map((slot) => [slot, slot]));
  const expect = (name, expectedCorners, expectedEdges) => {
    const state = generatePllCase(name, { auf: '' }).state;
    assert.deepEqual(topPieceMap(state, corners), expectedCorners, `${name}: corners`);
    assert.deepEqual(topPieceMap(state, edges), expectedEdges, `${name}: edges`);
  };

  expect('Aa', { UFR: 'UBL', UBR: 'UFR', UBL: 'UBR', UFL: 'UFL' }, solvedEdges);
  expect('Ab', { UFR: 'UBR', UBR: 'UBL', UBL: 'UFR', UFL: 'UFL' }, solvedEdges);
  expect('E', { UFR: 'UBR', UBR: 'UFR', UBL: 'UFL', UFL: 'UBL' }, solvedEdges);
  expect('H', solvedCorners, { UF: 'UB', UR: 'UL', UB: 'UF', UL: 'UR' });
  expect('Ua', solvedCorners, { UF: 'UR', UR: 'UL', UB: 'UB', UL: 'UF' });
  expect('Ub', solvedCorners, { UF: 'UF', UR: 'UL', UB: 'UR', UL: 'UB' });
  expect('Z', solvedCorners, { UF: 'UL', UR: 'UB', UB: 'UR', UL: 'UF' });
});

test('case identity remains stable for every AUF', () => {
  for (const entry of PLL_CASES) {
    for (const auf of ['', 'U', 'U2', "U'"]) {
      const prompt = generatePllCase(entry.name, { auf });
      assert.equal(identifyPllCase(prompt.state)?.name, entry.name, `${entry.name} with ${auf || 'no AUF'}`);
    }
  }
});

test('generation and identification do not mutate caller-owned cube state', () => {
  const original = createSolvedState();
  const snapshot = structuredClone(original);
  const prompt = generatePllCase('T', { auf: 'U2' });
  const promptSnapshot = structuredClone(prompt.state);
  identifyPllCase(prompt.state);
  assert.deepEqual(original, snapshot);
  assert.notEqual(prompt.state, original);
  assert.deepEqual(prompt.state, promptSnapshot);
});
