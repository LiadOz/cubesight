import test from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { GOLD } from './analysis-golden.mjs';
import { applyMoves, stateFromScramble } from '../src/cross-cube.js';
import { segmentSolve } from '../src/analysis/segment.js';
import { evaluatePairs, pairTargets } from '../src/analysis/pairs.js';
import { OLL_PATTERN_COUNT, OLL_PATTERNS } from '../src/analysis/last-layer-patterns.js';
import { unrelabelMoves } from '../src/analysis/normalize.js';
import { crossSolved, findCompletions, solvedSlots, SLOTS, trackedFrom } from '../src/analysis/pair-completion.js';
import { stateOf } from '../src/analysis/cube-model.js';

test('the synchronous worker cubie model matches cubing.js primitive and composed turns', async () => {
  const kp = await cube3x3x3.kpuzzle();
  for (const alg of ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2', "R U R' U' F2 D L2"]) {
    const d = kp.algToTransformation(alg).transformationData;
    const expected = new Uint8Array(46);
    for (let i = 0; i < 8; i++) { expected[i] = d.CORNERS.permutation[i]; expected[26 + i] = d.CORNERS.orientationDelta[i]; }
    for (let i = 0; i < 12; i++) { expected[8 + i] = 8 + d.EDGES.permutation[i]; expected[34 + i] = d.EDGES.orientationDelta[i]; }
    for (let i = 0; i < 6; i++) expected[20 + i] = 20 + d.CENTERS.permutation[i];
    assert.deepEqual(stateOf(alg), expected, alg);
  }
});

test('the OLL classifier enumerates all 57 AUF classes', () => {
  assert.equal(OLL_PATTERN_COUNT, 57);
});

test('all four pair stages return ranked, replayable completions on a warm engine', () => {
  const fixture = GOLD.normal;
  const moves = fixture.moves.split(' ');
  const segmentation = segmentSolve({ scramble: fixture.scramble, moves, crossFace: 'D' });
  assert.deepEqual(pairTargets(segmentation).map(target => target.n), [1, 2, 3, 4]);
  assert.deepEqual(pairTargets(segmentation).map(target => target.chosenSlotOriginal), segmentation.pairs.map(pair => pair.slotOriginal));
  const result = evaluatePairs(segmentation, null, { maxDepth: 12, slack: 0, timeBudgetMs: 120 });
  assert.equal(result.length, 4);
  assert.ok(Number.isFinite(result[0].coldMs) && result[0].coldMs >= 0, 'cold table cost is recorded separately from the search budget');
  for (const pair of result) {
    assert.ok(['FR', 'BR', 'BL', 'FL'].includes(pair.chosenSlot), `pair ${pair.n} records the slot actually completed`);
    assert.deepEqual(pair.chosenSlots, [pair.chosenSlot]);
    assert.ok(pair.chosenShortest === null || Number.isInteger(pair.chosenShortest));
    assert.equal(typeof pair.chosenProven, 'boolean');
    assert.ok(pair.bestSlot === null || ['FR', 'BR', 'BL', 'FL'].includes(pair.bestSlot));
    assert.ok(pair.shortest === null || Number.isInteger(pair.shortest), 'global shortest is reported separately from ergonomic ranking');
    assert.ok(pair.options.length, `pair ${pair.n} should have at least one completion`);
    assert.ok(pair.options.every((option, i) => i === 0 || pair.options[i - 1].stm <= option.stm), 'options are ranked by STM');
    assert.ok(pair.options.every(option => Number.isInteger(option.stm) && Number.isInteger(option.etm) && option.generators && Number.isFinite(option.ergonomicScore)));
    assert.ok(pair.ms < 200, `warm pair ${pair.n} took ${pair.ms} ms`);
    const prefix = [segmentation.normalized.scramble, ...segmentation.normalized.moves.slice(0, pair.from)].filter(Boolean).join(' ');
    const start = stateFromScramble(prefix);
    const beforePairs = solvedSlots(trackedFrom(prefix), pair.frame);
    const completion = applyMoves(start, pair.options[0].moves);
    const verified = trackedFrom(`${prefix} ${pair.options[0].moves.join(' ')}`);
    const goalShift = pair.options[0].goalShift;
    assert.equal(crossSolved(verified, goalShift), true, `pair ${pair.n} keeps the cross in the selected end frame`);
    assert.ok(solvedSlots(verified, goalShift).length > beforePairs.length, `pair ${pair.n} completes at least one pair`);
    assert.ok(beforePairs.every(slot => solvedSlots(verified, goalShift).includes(slot)), `pair ${pair.n} preserves completed pairs`);
    assert.ok(completion, 'the candidate also replays through the real cube model');
  }
});

test('pseudo-offset pair completions search from the recorded frame and verify', () => {
  const fixture = GOLD.pseudoPair;
  const moves = fixture.moves.split(' ');
  const segmentation = segmentSolve({ scramble: fixture.scramble, moves, crossFace: 'D' });
  const result = evaluatePairs(segmentation, null, { maxDepth: 12, slack: 0, timeBudgetMs: 120 });
  const pseudo = result.find(pair => pair.frame !== 0);
  assert.ok(pseudo, 'fixture includes a D-offset pair boundary');
  assert.equal(pseudo.frameTurn, null, 'the planner does not force a D correction before searching');
  assert.ok(pseudo.options.length);
  const start = stateFromScramble([segmentation.normalized.scramble, ...segmentation.normalized.moves.slice(0, pseudo.from)].filter(Boolean).join(' '));
  const prefix = [segmentation.normalized.scramble, ...segmentation.normalized.moves.slice(0, pseudo.from)].filter(Boolean).join(' ');
  applyMoves(start, pseudo.options[0].moves);
  const final = trackedFrom(`${prefix} ${pseudo.options[0].moves.join(' ')}`);
  assert.equal(crossSolved(final, pseudo.options[0].goalShift), true);
  const preserved = solvedSlots(trackedFrom(prefix), pseudo.frame);
  assert.ok(preserved.every(slot => solvedSlots(final, pseudo.options[0].goalShift).includes(slot)), 'pairs solved in the starting pseudo frame remain solved at the selected end frame');
});

test('the pair search also reaches a verified D-offset end goal', () => {
  const start = trackedFrom("R U R'");
  const preserve = solvedSlots(start);
  assert.equal(crossSolved(start), true);
  const found = findCompletions(start, { newSlots: [0], preserve, goalShift: 1, maxDepth: 8, maxSolutions: 3, slack: 0, timeBudgetMs: 1000, useCrossEdge: false });
  assert.ok(found.solutions.length);
  const end = trackedFrom(`R U R' ${found.solutions[0]}`);
  assert.equal(crossSolved(end, 1), true);
  assert.ok(solvedSlots(end, 1).includes(0), `FR reaches the D-offset goal; slots=${solvedSlots(end, 1).map(i => SLOTS[i].name)}`);
  assert.ok(preserve.every(slot => solvedSlots(end, 1).includes(slot)), 'all completed pairs remain solved in that end frame');
});

test('last-layer case capture is colour-neutral and keeps timing at the case boundary', () => {
  const fixture = GOLD.normal;
  const moves = fixture.moves.split(' ');
  const faceD = segmentSolve({ scramble: fixture.scramble, moves, crossFace: 'D', moveTimes: moves.map((_, i) => 100 + i * 200) });
  const faceF = segmentSolve({
    scramble: unrelabelMoves(fixture.scramble.split(' '), 'F').join(' '),
    moves: unrelabelMoves(moves, 'F'), crossFace: 'F', moveTimes: moves.map((_, i) => 100 + i * 200),
  });
  assert.ok(OLL_PATTERNS.some(pattern => pattern.id === faceD.cases.oll.id || pattern.standardName === faceD.cases.oll.id));
  assert.equal(faceD.cases.pll.id, 'T');
  assert.equal(faceF.cases.oll.id, faceD.cases.oll.id);
  assert.equal(faceF.cases.pll.id, faceD.cases.pll.id);
  assert.equal(faceD.cases.oll.recognitionMs, 200);
  assert.equal(faceD.cases.oll.executionMs, 2600);
});
