import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerSetup, formatWeight, invertAlgorithm, plannerChoices, weightedMoveCount, wideURequest, wideUResults } from '../src/f2l-planner.js';
import { validateSolution } from '../src/cross-cube.js';

test('planner setups preserve the cross and contain zero to two solved pairs', () => {
  for (let seed = 0; seed < 60; seed += 1) {
    const setup = createPlannerSetup(seed);
    assert.ok(setup.solvedCount >= 0 && setup.solvedCount <= 2);
    assert.ok(setup.scramble.length > 0);
  }
});

test('shifted D setups start with a real bottom-layer offset', () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const setup = createPlannerSetup(seed, { shiftD: true });
    assert.ok(["D", "D'", "D2"].includes(setup.dShift));
    assert.equal(setup.scramble.split(' ').at(-1), setup.dShift);
    assert.equal(setup.solvedCount, createPlannerSetup(seed).solvedCount);
  }
});

test('weighted metric counts D and strongly penalizes front/back turns', () => {
  assert.equal(weightedMoveCount(['R', 'U2', 'D']), 3);
  assert.equal(weightedMoveCount(['F', "B'", 'x']), 12);
  assert.equal(weightedMoveCount(['Uw', "Uw'"]), 2);
  assert.equal(formatWeight(4.5), '4.5');
});

test('planner choices are independently simulated and preserve solved pairs', () => {
  const setup = createPlannerSetup(0);
  const solveEverything = invertAlgorithm(setup.scramble).split(' ');
  const choices = plannerChoices(setup, [{ moves: solveEverything }]);
  assert.equal(choices.length, 2);
  assert.ok(choices.every((choice) => choice.moves.join(' ') === solveEverything.join(' ')));
});

test('D realignment alone is not scored as a newly solved pair', () => {
  const setup = createPlannerSetup(2, { shiftD: true });
  const undoShift = invertAlgorithm(setup.dShift).split(' ');
  assert.equal(plannerChoices(setup, [{ moves: undoShift }]).length, 0);
});

test('generated recovery plans provide at least two valid choices in both D modes', () => {
  for (const shiftD of [false, true]) for (let seed = 0; seed < 24; seed += 1) {
    const setup = createPlannerSetup(seed, { shiftD });
    const choices = plannerChoices(setup, setup.recoveryPlans.map((moves) => ({ moves })));
    assert.ok(choices.length >= 2, `seed ${seed}, shifted ${shiftD}`);
  }
});

test('wide U routes cost one move and solve relative to the rotated centers', () => {
  for (const suffix of ['', "'", '2']) for (let seed = 0; seed < 12; seed += 1) {
    const setup = createPlannerSetup(seed, { shiftD: seed % 2 === 0 });
    const request = wideURequest(setup, suffix);
    const [result] = wideUResults(request, [{ moves: invertAlgorithm(request.scramble).split(' ') }]);
    const outcome = validateSolution(setup.state, result.moves, 'D');
    assert.equal(outcome.crossSolved, true);
    assert.equal(outcome.pairs.length, 4);
    assert.equal(weightedMoveCount([request.prefix]), 1);
  }
});
