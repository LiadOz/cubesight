import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerSetup, invertAlgorithm } from '../src/f2l-planner.js';
import { analysisStateFromScramble } from '../src/analysis/long-replay.js';
import { applyMoves, createSolvedState, sameCubeState, validateSolution } from '../src/cross-cube.js';
import { currentDShift, f2lPairSlots, ollSolved, pairReadiness, solvedPairsPseudo } from '../src/solve-tracker.js';
import { bestCompletions } from '../src/analysis/pair-completion.js';
import { generatePinVariations } from '../src/drills/pin-variations.js';
import { getCases } from '../src/algs/seed/cases.js';
import { identifyPllCase } from '../src/pll-logic.js';

function seededRandom(seed = 123) {
  let value = seed;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 0x1_0000_0000;
  };
}

const atHome = (state, id) => {
  const normals = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
  const home = [...id].reduce((point, face) => point.map((n, i) => n + normals[face][i]), [0, 0, 0]);
  const position = state.cubies.find(cubie => cubie.id === id)?.position;
  return position?.every((n, i) => n === home[i]);
};

function rotateDToF(algorithm) {
  const face = { D: 'F', U: 'B', F: 'U', B: 'D', R: 'R', L: 'L' };
  return algorithm.trim().split(/\s+/).filter(Boolean).map(move => `${face[move[0]]}${move.slice(1)}`).join(' ');
}

test('a keyhole pin keeps its open corner home when another pair is randomized', async () => {
  // This post-cross setup has the BR corner home while its BR edge is away:
  // BR is an open keyhole slot. The pinned answer completes FR using that slot.
  const setup = createPlannerSetup(2);
  const openSlot = f2lPairSlots('D').find(pair => pair.slot === 'BR');
  const openCorner = setup.state.cubies.find(cubie => cubie.id === openSlot.cornerId);
  assert.ok(pairReadiness(setup.state, openSlot).cornerSolved);
  assert.equal(pairReadiness(setup.state, openSlot).edgeSolved, false);

  const answer = ['R2', 'B2', 'R2', 'B2']; // verified FR completion for this setup
  assert.ok(validateSolution(setup.state, answer, 'D').pairs.some(pair => pair.slot === 'FR'));
  const variants = await generatePinVariations({
    trainer: 'f2l', scramble: setup.scramble, movesUpTo: [], crossFace: 'D',
    stage: 'pair1', better: answer, yours: [],
  }, { count: 3, random: seededRandom(123), maxAttempts: 36 });

  assert.ok(variants.length > 0);
  assert.ok(variants.every(item => validateSolution(item.state, answer, 'D').pairs.some(pair => pair.slot === 'FR')));
  assert.ok(variants.every(item => atHome(item.state, openSlot.cornerId)),
    `a keyhole corner must stay in the open slot; source was ${openCorner.position.join(',')}`);
});

test('pseudo-D frame is accepted and retained before and after the pinned completion', async () => {
  const setup = createPlannerSetup(2, { shiftD: true });
  const frame = currentDShift(setup.state, 'D');
  const plan = bestCompletions(setup.scramble, { startShift: frame, maxDepth: 12, timeBudgetMs: 500, maxSolutions: 6 });
  const candidate = plan.candidates.find(item => item.options.some(option => option.goalShift === frame));
  assert.ok(candidate);
  const answer = candidate.options.find(option => option.goalShift === frame).tokens;
  const sourceState = analysisStateFromScramble(setup.scramble);
  const completedState = analysisStateFromScramble(`${setup.scramble} ${answer.join(' ')}`);
  assert.notEqual(currentDShift(sourceState, 'D'), 0);
  assert.equal(currentDShift(completedState, 'D'), currentDShift(sourceState, 'D'));

  const variants = await generatePinVariations({
    trainer: 'f2l', scramble: setup.scramble, movesUpTo: [], crossFace: 'D',
    stage: 'pair1', better: answer, yours: [],
  }, { count: 2, random: seededRandom(22), maxAttempts: 36 });

  assert.ok(variants.length > 0, 'a verified pseudo-frame completion should produce variations');
  for (const item of variants) {
    assert.equal(currentDShift(item.state, 'D'), currentDShift(sourceState, 'D'), 'variation must preserve the pinned pseudo offset');
    const after = analysisStateFromScramble(`${item.scramble} ${answer.join(' ')}`);
    assert.equal(currentDShift(after, 'D'), currentDShift(sourceState, 'D'), 'pinned answer must preserve the same offset');
  }
});

test('non-D cross pins remain normalized to their selected face', async () => {
  const setup = createPlannerSetup(22);
  const scramble = rotateDToF(setup.scramble);
  const answer = rotateDToF(setup.recoveryPlans.at(-1).join(' ')).split(/\s+/);
  const state = analysisStateFromScramble(scramble);
  assert.equal(validateSolution(state, answer, 'F').crossSolved, true);
  const planner = async ({ scramble: candidate }) => ({
    results: [{ moves: invertAlgorithm(candidate).split(/\s+/) }],
  });
  const variants = await generatePinVariations({
    trainer: 'cross', scramble, movesUpTo: [], crossFace: 'F', stage: 'cross', better: answer, yours: [],
  }, { count: 1, random: seededRandom(82), planner, maxAttempts: 36 });

  assert.ok(variants.length > 0);
  assert.ok(variants.every(item => validateSolution(item.state, answer, 'F').crossSolved));
});

test('a non-empty but invalid cross-planner reply is rejected', async () => {
  const setup = createPlannerSetup(22);
  const variants = await generatePinVariations({
    trainer: 'cross', scramble: setup.scramble, movesUpTo: [], crossFace: 'D',
    stage: 'cross', better: ['U'], yours: [],
  }, {
    count: 1, random: seededRandom(42), maxAttempts: 36,
    planner: async () => ({ results: [{ moves: ['R'] }] }),
  });

  assert.equal(variants.length, 0, 'planner presence alone cannot prove the randomized state is solvable');
});

test('OLL and PLL variations are regraded against solved cross and F2L states', async () => {
  const oll = getCases('oll').find(row => row.id === 'oll/21');
  const ollPin = { trainer: 'oll', scramble: oll.setup, movesUpTo: [], crossFace: 'D', stage: 'oll', better: null, yours: [] };
  const ollVariants = await generatePinVariations(ollPin, { count: 2, random: seededRandom(210) });
  assert.ok(ollVariants.length > 0);
  for (const item of ollVariants) {
    const completed = applyMoves(item.state, oll.algs[0].moves);
    assert.equal(currentDShift(completed, 'D'), 0);
    assert.equal(solvedPairsPseudo(completed, 'D').length, 4);
    assert.equal(ollSolved(completed, 'D'), true);
  }

  const pll = getCases('pll').find(row => row.id === 'pll/H');
  const pllPin = { trainer: 'pll', scramble: pll.setup, movesUpTo: [], crossFace: 'D', stage: 'pll', better: null, yours: [] };
  const pllVariants = await generatePinVariations(pllPin, { count: 3, random: seededRandom(320) });
  assert.ok(pllVariants.length > 0);
  for (const item of pllVariants) {
    assert.equal(identifyPllCase(item.state)?.name, pll.name);
    const completed = applyMoves(item.state, pll.algs[0].moves);
    assert.equal(currentDShift(completed, 'D'), 0);
    assert.equal(solvedPairsPseudo(completed, 'D').length, 4);
    assert.ok(['', 'U', 'U2', "U'"].some(auf => sameCubeState(auf ? applyMoves(completed, [auf]) : completed, createSolvedState())));
  }
});
