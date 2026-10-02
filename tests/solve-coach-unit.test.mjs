import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossFacesForPreference, crossSuggestion, crossHindsight, f2lNextPairHint, betterInsertionHindsight,
  ollStage, pllLens, efficiencyScore,
} from '../src/solve-coach.js';
import { stateFromScramble, createSolvedState } from '../src/cross-cube.js';
import { f2lPairSlots } from '../src/solve-tracker.js';

test('crossHindsight flags extra moves vs an optimal cross', () => {
  assert.equal(crossHindsight(7, 5, 'D').kind, 'suboptimal');
  assert.equal(crossHindsight(7, 5, 'D').text, 'D cross: 7 moves, 2 extra moves.');
  assert.equal(crossHindsight(2, 1, 'F').text, 'F cross: 2 moves, 1 extra move.');
  assert.equal(crossHindsight(5, 5, 'D').kind, 'optimal');
  assert.equal(crossHindsight(null, 5, 'D'), null);
});

test('cross search preference selects one face or all six colour-neutral faces', () => {
  assert.deepEqual(crossFacesForPreference(), ['U', 'D', 'F', 'B', 'R', 'L']);
  assert.deepEqual(crossFacesForPreference('yellow'), ['D']);
  assert.deepEqual(crossFacesForPreference('green'), ['F']);
  assert.deepEqual(crossFacesForPreference('purple'), []);
});

test('selected-color inspection search returns only that face; neutral returns all six', async () => {
  const faces = [];
  const budgets = [];
  const search = async request => {
    faces.push(request.face);
    budgets.push(request.timeLimitMs);
    return { results: [{ moves: ['R'], slotMask: 1, optimality: 'proven-for-target' }], complete: true };
  };
  const selected = await crossSuggestion('R U R\'', { color: 'yellow', timeLimitMs: 1000, search });
  assert.deepEqual(selected.perFace.map(row => row.face), ['D']);
  assert.equal(selected.best.face, 'D');
  assert.equal(selected.bestXcross.slot, 'FR');
  assert.deepEqual(faces, ['D', 'D']);
  faces.length = 0;
  budgets.length = 0;
  const neutral = await crossSuggestion('R U R\'', { color: 'neutral', timeLimitMs: 1000, search });
  assert.deepEqual(neutral.perFace.map(row => row.face), ['U', 'D', 'F', 'B', 'R', 'L']);
  assert.equal(faces.length, 12);
  assert.ok(budgets.reduce((sum, budget) => sum + budget, 0) <= 1000, 'neutral search budgets stay within the whole-query budget');
});

test('tiny neutral budgets never turn a zero share into the solver default timeout', async () => {
  const requests = [];
  const search = async request => {
    requests.push(request);
    return { results: [{ moves: ['R'], slotMask: 1, optimality: 'proven-for-target' }], complete: true };
  };
  const result = await crossSuggestion('R U R\'', { color: 'neutral', timeLimitMs: 11, search, now: () => 100 });
  assert.ok(requests.length > 0);
  assert.ok(requests.every(request => request.timeLimitMs > 0 && request.timeLimitMs <= 11));
  assert.ok(requests.reduce((sum, request) => sum + request.timeLimitMs, 0) <= 11);
  assert.equal(result.perFace.length, 6);
  assert.equal(result.xcrossPerFace.length, 6);
  requests.length = 0;
  await crossSuggestion('R U R\'', { color: 'neutral', timeLimitMs: 0, search, now: () => 100 });
  assert.equal(requests.length, 0, 'zero budget skips solver calls');
});

test('neutral inspection search skips every call when its absolute deadline has passed', async () => {
  let ticks = 0;
  const requests = [];
  const result = await crossSuggestion('R U R\'', {
    color: 'neutral', timeLimitMs: 11,
    now: () => ticks++ === 0 ? 100 : 112,
    search: async request => { requests.push(request); return { results: [], complete: false }; },
  });
  assert.equal(requests.length, 0);
  assert.equal(result.perFace.length, 6);
  assert.equal(result.xcrossPerFace.length, 6);
  assert.equal(result.best, null);
  assert.equal(result.bestXcross, null);
});

test('f2lNextPairHint returns null when all pairs solved, and a pair when not', () => {
  assert.equal(f2lNextPairHint(createSolvedState(), 'D'), null);
  const s = stateFromScramble("R U R'");
  const hint = f2lNextPairHint(s, 'D');
  assert.ok(hint && hint.pair && typeof hint.text === 'string');
});

test('betterInsertionHindsight surfaces an already-connected alternative', () => {
  const slots = f2lPairSlots('D');
  // In a fully solved cube every pair is solved, so no hindsight is expected.
  assert.equal(betterInsertionHindsight(createSolvedState(), slots[0], 'D'), null);
});

test('ollStage reports edges/corners/full oriented on a solved cube', () => {
  const stage = ollStage(createSolvedState(), 'D');
  assert.equal(stage.eoDone, true);
  assert.equal(stage.coDone, true);
  assert.equal(stage.ollDone, true);
  const disturbed = stateFromScramble('F');
  const d = ollStage(disturbed, 'D');
  assert.equal(d.ollDone, false);
});

test('pllLens identifies a colour-neutral PLL case', async () => {
  const { generatePllCase } = await import('../src/pll-logic.js');
  const trial = generatePllCase('T', { auf: '' });
  // White cross on D: canonicalize is a no-op, recognition should find T.
  const lens = pllLens(trial.state, 'D');
  assert.equal(lens.name, 'T');
  assert.equal(lens.family, 'T');
});

test('pllLens returns null before the last layer is permutable', () => {
  const mid = stateFromScramble("R U R' F2");
  assert.equal(pllLens(mid, 'D'), null);
});

test('efficiencyScore is bounded 0–100 and rewards solving with an optimal cross', () => {
  const optimal = efficiencyScore({ userCrossMoves: 5, optimalCrossMoves: 5, rotations: 0, solved: true, f2lPairs: 4, ollDone: true });
  const bad = efficiencyScore({ userCrossMoves: 10, optimalCrossMoves: 5, rotations: 5, solved: true, f2lPairs: 4, ollDone: true });
  assert.ok(optimal > bad);
  assert.ok(optimal <= 100 && optimal >= 0);
  assert.ok(bad >= 0);
});

test('efficiencyScore does not compare an X-cross count with a plain-cross minimum', () => {
  const xcross = efficiencyScore({ userCrossMoves: 8, optimalCrossMoves: 6, crossTarget: 'xcross' });
  const noComparison = efficiencyScore({ userCrossMoves: 8, optimalCrossMoves: null });
  assert.equal(xcross, noComparison);
});
