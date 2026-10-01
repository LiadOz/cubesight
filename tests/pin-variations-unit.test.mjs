import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerSetup } from '../src/f2l-planner.js';
import { validateSolution, sameCubeState } from '../src/cross-cube.js';
import { getCase } from '../src/algs/seed/cases.js';
import { generatePinVariations } from '../src/drills/pin-variations.js';
import { identifyOllCase } from '../src/drills/oll-model.js';
import { analysisStateFromScramble } from '../src/analysis/long-replay.js';
import { bestCompletions } from '../src/analysis/pair-completion.js';

function seededRandom(seed = 123456789) {
  let value = seed;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

test('OLL pin variations change the start while keeping the canonical case', async () => {
  const row = getCase('oll/21');
  const longSetup = `${row.setup} ${Array.from({ length: 101 }, () => "R R'").join(' ')}`;
  const pin = { trainer: 'oll', scramble: longSetup, movesUpTo: [], better: null, yours: [] };
  const variants = await generatePinVariations(pin, { count: 3, random: seededRandom() });

  assert.ok(variants.length > 0);
  assert.ok(variants.every(item => item.verified && item.plannerChecked && item.randomized));
  const recognized = await Promise.all(variants.map(item => identifyOllCase(item.scramble)));
  assert.ok(recognized.every(found => found?.id === row.id));
  assert.ok(variants.every(item => !sameCubeState(item.state, analysisStateFromScramble(longSetup))));
});

test('lookahead pin variations keep the cross, prior pairs, and target pair solvable', async () => {
  const setup = createPlannerSetup(1);
  const planned = bestCompletions(setup.scramble, { maxDepth: 12, timeBudgetMs: 160, maxSolutions: 6 });
  const target = planned.candidates.find(candidate => candidate.options.length);
  assert.ok(target);
  const choice = { slot: target.slots[0], moves: target.options[0].tokens };
  const pin = {
    trainer: 'lookahead', scramble: setup.scramble, movesUpTo: [], crossFace: 'D',
    stage: 'pair1', better: choice.moves, yours: [],
  };
  const source = validateSolution(setup.state, [], 'D');
  const variants = await generatePinVariations(pin, { count: 2, maxAttempts: 36, random: seededRandom() });

  assert.ok(variants.length > 0);
  for (const variant of variants) {
    assert.ok(variant.verified && variant.plannerChecked && variant.randomized);
    assert.ok(!sameCubeState(variant.state, setup.state));
    const result = validateSolution(variant.state, choice.moves, 'D');
    assert.equal(result.crossSolved, true);
    assert.ok(source.pairs.every(pair => result.pairs.some(found => found.slot === pair.slot)));
    assert.ok(result.pairs.some(pair => pair.slot === choice.slot));
  }
});

test('cross pin variations require an explicit solver result before they can be offered', async () => {
  const setup = createPlannerSetup(22);
  let plannerCalls = 0;
  const pin = { trainer: 'cross', scramble: setup.scramble, movesUpTo: [], crossFace: 'D', stage: 'cross', better: ['U'], yours: [] };
  const variants = await generatePinVariations(pin, {
    count: 1,
    random: seededRandom(42),
    planner: async () => { plannerCalls += 1; return { results: [{ moves: ['U'] }] }; },
  });
  assert.ok(variants.length > 0);
  assert.ok(plannerCalls > 0);
  assert.ok(variants.every(item => item.plannerChecked && item.verified));
});
