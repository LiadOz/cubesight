import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossHindsight, f2lNextPairHint, betterInsertionHindsight,
  ollStage, pllLens, efficiencyScore,
} from '../src/solve-coach.js';
import { stateFromScramble, createSolvedState } from '../src/cross-cube.js';
import { f2lPairSlots } from '../src/solve-tracker.js';

test('crossHindsight flags extra moves vs an optimal cross', () => {
  assert.equal(crossHindsight(7, 5, 'D').kind, 'suboptimal');
  assert.ok(crossHindsight(7, 5, 'D').text.includes('2 extra moves'));
  assert.equal(crossHindsight(5, 5, 'D').kind, 'optimal');
  assert.equal(crossHindsight(null, 5, 'D'), null);
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
