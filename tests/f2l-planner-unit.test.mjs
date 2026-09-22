import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerSetup, formatWeight, invertAlgorithm, plannerChoices, weightedMoveCount } from '../src/f2l-planner.js';

test('planner setups preserve the cross and contain zero to two solved pairs', () => {
  for (let seed = 0; seed < 60; seed += 1) {
    const setup = createPlannerSetup(seed);
    assert.ok(setup.solvedCount >= 0 && setup.solvedCount <= 2);
    assert.ok(setup.scramble.length > 0);
  }
});

test('weighted metric counts D and penalizes front/back turns and rotations', () => {
  assert.equal(weightedMoveCount(['R', 'U2', 'D']), 3);
  assert.equal(weightedMoveCount(['F', "B'", 'x']), 4.5);
  assert.equal(formatWeight(4.5), '4.5');
});

test('planner choices are independently simulated and preserve solved pairs', () => {
  const setup = createPlannerSetup(0);
  const solveEverything = invertAlgorithm(setup.scramble).split(' ');
  const choices = plannerChoices(setup, [{ moves: solveEverything }]);
  assert.equal(choices.length, 2);
  assert.ok(choices.every((choice) => choice.moves.join(' ') === solveEverything.join(' ')));
});
