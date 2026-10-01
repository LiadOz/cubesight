import test from 'node:test';
import assert from 'node:assert/strict';
import { cube3x3x3 } from 'cubing/puzzles';
import { GOLD } from './analysis-golden.mjs';
import { applyMoves, stateFromScramble } from '../src/cross-cube.js';
import { segmentSolve } from '../src/analysis/segment.js';
import { evaluatePairs, evaluatePairsAsync, pairTargets } from '../src/analysis/pairs.js';
import { OLL_PATTERN_COUNT, OLL_PATTERNS } from '../src/analysis/last-layer-patterns.js';
import { unrelabelMoves } from '../src/analysis/normalize.js';
import { bestCompletions, buildPairCrossTables, crossSolved, findCompletions, PAIR_CROSS_TABLE_BYTES, PAIR_CROSS_TABLE_VERSION, pairCrossTable, solvedSlots, SLOTS, trackedFrom } from '../src/analysis/pair-completion.js';
import { installCachedPairCrossTables } from '../src/analysis/pair-table-cache.js';
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

test('async pair search publishes a first pass before its optional-table upgrade', async () => {
  const fixture = GOLD.normal;
  const segmentation = segmentSolve({ scramble: fixture.scramble, moves: fixture.moves.split(' '), crossFace: 'D' });
  const updates = [];
  const result = await evaluatePairsAsync(segmentation, null, {
    maxPairs: 1, maxDepth: 12, initialBudgetMs: 30, upgradeBudgetMs: 400, slack: 0,
    onProgress: pairs => updates.push(pairs),
  });
  assert.equal(result.length, 1);
  assert.equal(updates.length, 2, 'quick and refined results are both published');
  assert.equal(updates[0][0].pendingUpgrade, true);
  assert.equal(updates[1][0].pendingUpgrade, false);
  assert.ok(updates[0][0].options.length, 'the first pass includes a usable candidate or recorded upper bound');
  assert.equal(result[0].proven, true, 'the refined shortest proof is independent of alternative enumeration');
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

test('one IDA run searches the union of all four D-offset end goals', () => {
  const setup = "R U R'";
  const codes = trackedFrom(setup), preserve = solvedSlots(codes);
  const any = findCompletions(codes, { newSlots: [0], preserve, goalShift: 'any', maxDepth: 8, maxSolutions: 20, slack: 0, timeBudgetMs: 1000, useCrossEdge: false });
  const exact = [0, 1, 2, 3].map(goalShift => findCompletions(codes, { newSlots: [0], preserve, goalShift, maxDepth: 8, maxSolutions: 1, slack: 0, timeBudgetMs: 1000, useCrossEdge: false }));
  assert.equal(any.shortest, Math.min(...exact.map(result => result.shortest < 0 ? Infinity : result.shortest)));
  assert.equal(any.shortestProven, true);
  assert.ok(any.solutions.every((moves, index) => {
    const shift = any.solutionGoalShifts[index];
    const end = trackedFrom(`${setup} ${moves}`);
    return crossSolved(end, shift) && preserve.every(slot => solvedSlots(end, shift).includes(slot)) && solvedSlots(end, shift).includes(0);
  }));
});

test('minimum proof survives stopping before all ergonomic alternatives are enumerated', () => {
  const codes = trackedFrom("R U R'"), preserve = solvedSlots(codes);
  const result = findCompletions(codes, { newSlots: [0], preserve, goalShift: 'any', maxDepth: 10, maxSolutions: 1, slack: 2, timeBudgetMs: 1000, useCrossEdge: false });
  assert.ok(result.solutions.length);
  assert.equal(result.shortestProven, true, 'all lower depth bounds are complete once the first shortest path is found');
  assert.equal(result.alternativesComplete, false, 'the solution cap stopped ergonomic alternative enumeration');
});

test('optional pair plus adjacent cross-edge tables are goal-seeded and admissible', () => {
  const adjacent = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (let slot = 0; slot < 4; slot++) {
    const table = pairCrossTable(slot);
    assert.equal(table.length, 24 ** 4);
    for (const goal of ['', "D'", 'D2', 'D']) {
      const codes = trackedFrom(goal);
      const [a, b] = adjacent[slot];
      const at = (((codes[a] * 24 + codes[b]) * 24 + codes[4 + slot]) * 24 + codes[8 + slot]);
      assert.equal(table[at], 0, `slot ${slot} goal ${goal || 'plain'} is a zero-distance seed`);
    }
    for (const setup of ["R U R'", 'F2 U L D']) {
      const state = trackedFrom(setup), [a, b] = adjacent[slot];
      const at = codes => (((codes[a] * 24 + codes[b]) * 24 + codes[4 + slot]) * 24 + codes[8 + slot]);
      const here = table[at(state)];
      for (const move of ['U', "U'", 'R', "R'", 'F', "F'", 'D', "D'"]) {
        const next = table[at(trackedFrom(`${setup} ${move}`))];
        assert.ok(here <= next + 1, `slot ${slot}: PDB distance obeys the one-move lower-bound property`);
      }
    }
  }
});

test('optional table cache rejects stale or malformed IndexedDB records', () => {
  const tables = buildPairCrossTables();
  const good = { version: PAIR_CROSS_TABLE_VERSION, bytes: PAIR_CROSS_TABLE_BYTES, tables };
  assert.equal(installCachedPairCrossTables({ ...good, version: PAIR_CROSS_TABLE_VERSION - 1 }), null, 'table algorithm version must match');
  assert.equal(installCachedPairCrossTables({ ...good, bytes: PAIR_CROSS_TABLE_BYTES - 1 }), null, 'declared size must match');
  assert.equal(installCachedPairCrossTables({ ...good, tables: [new Uint8Array(2), ...tables.slice(1)] }), false, 'every projection has the exact expected length');
  assert.equal(installCachedPairCrossTables(good), true, 'all four validated projections can be restored');
});

test('IDA* minimum agrees with an independent cubing.js shallow BFS', async () => {
  const kp = await cube3x3x3.kpuzzle();
  const setup = "R U R'";
  const startCodes = trackedFrom(setup), preserve = solvedSlots(startCodes);
  const open = SLOTS.map((_, i) => i).filter(i => !preserve.includes(i));
  assert.equal(open.length, 1);
  const exact = bestCompletions(setup, { maxDepth: 5, timeBudgetMs: 1000, slack: 0 });
  assert.equal(exact.proven, true);

  const goals = ['', "D'", 'D2', 'D'].map(alg => kp.defaultPattern().applyAlg(alg).patternData);
  const targetPieces = [4, 5, 6, 7].map(home => ({ kind: 'EDGES', home }))
    .concat(preserve.flatMap(i => [{ kind: 'EDGES', home: SLOTS[i].e }, { kind: 'CORNERS', home: SLOTS[i].c }]))
    .concat([{ kind: 'EDGES', home: SLOTS[open[0]].e }, { kind: 'CORNERS', home: SLOTS[open[0]].c }]);
  const solvedAtGoal = pattern => goals.some(goal => {
    return targetPieces.every(home => {
      const statePart = pattern[home.kind], goalPart = goal[home.kind];
      const position = statePart.pieces.indexOf(home.home);
      const goalPosition = goalPart.pieces.indexOf(home.home);
      return position === goalPosition && statePart.orientation[position] === goalPart.orientation[goalPosition];
    });
  });
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
  const suffixes = ['', "'", '2'];
  const rank = { U: 1, D: 0, R: 1, L: 0, F: 1, B: 0 };
  const axis = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
  const moves = faces.flatMap(face => suffixes.map(suffix => face + suffix));
  let frontier = [{ state: kp.defaultPattern().applyAlg(setup), last: '' }];
  let bfsDepth = solvedAtGoal(frontier[0].state.patternData) ? 0 : -1;
  for (let depth = 1; bfsDepth < 0 && depth <= 5; depth++) {
    const next = [];
    for (const entry of frontier) for (const move of moves) {
      const face = move[0], previousFace = entry.last;
      if (face === previousFace || (previousFace && axis[face] === axis[previousFace] && rank[face] < rank[previousFace])) continue;
      const state = entry.state.applyMove(move);
      if (solvedAtGoal(state.patternData)) { bfsDepth = depth; break; }
      next.push({ state, last: face });
    }
    frontier = next;
  }
  assert.equal(bfsDepth, exact.shortest, 'cubing.js state-space BFS independently confirms the minimum');
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
