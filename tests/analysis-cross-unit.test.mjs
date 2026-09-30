import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMoves, stateFromScramble } from '../src/cross-cube.js';
import { crossSolved } from '../src/solve-tracker.js';
import { segmentSolve } from '../src/analysis/segment.js';
import { evaluateCross, evaluateCrossAsync } from '../src/analysis/cross-eval.js';
import { analyzeSolve, analyzeSolveAsync, createAnalysisHandler } from '../src/analysis/index.js';
import { cachedSolver } from '../src/analysis/wasm-solver.js';
import { loadNodeSolver } from '../src/analysis/node-solver.js';
import { GOLD, MOCK } from './analysis-golden.mjs';

// These run the real xcross WASM in node (first query builds tables, about 1 s).
const solver = await loadNodeSolver();

const mock = () => segmentSolve({ scramble: MOCK.scramble, moves: MOCK.cross });

test('mock cross (SPEC 4.1): distance curve, losses, first moves, best continuation', () => {
  const seg = mock();
  assert.equal(seg.marks.crossIdx, 7);
  const cross = evaluateCross({ segmentation: seg }, solver);
  assert.equal(cross.face, 'D');
  assert.equal(cross.frames, 'plain');
  assert.deepEqual(cross.positions.map(p => p.d), [6, 5, 4, 3, 4, 3, 2, 1, 0]);
  assert.deepEqual(cross.positions.slice(1).map(p => p.loss), [0, 0, 0, 2, 0, 0, 0, 0]);
  assert.equal(cross.totalLoss, 2);
  assert.equal(cross.d0, 6);
  assert.equal(cross.userMoves, 8);
  assert.equal(cross.extraMoves, 2, 'losses add up to moves played minus the optimal length');
  assert.equal(cross.finished, true);
  assert.equal(cross.complete, true);
  assert.equal(cross.positions[4].move, 'D', 'the detour is the fourth move');
  // The exact shortest-path first moves at move 0 (SPEC golden-mock.json).
  assert.deepEqual([...cross.positions[0].firstMoves].sort(), ["B", "D", "F'", "L'"]);
  assert.equal(cross.bestContinuation.length, 6);
  assert.deepEqual(cross.positions[3].best.length, 3);
  // Better cross: lengths of every face at move 0.
  assert.deepEqual(cross.faceLengths, { U: 5, D: 6, F: 5, B: 4, R: 5, L: 6 });
});

test('the best continuation really finishes the cross', () => {
  const cross = evaluateCross({ segmentation: mock() }, solver);
  for (const row of cross.positions) {
    const prefix = MOCK.cross.split(' ').slice(0, row.i);
    const state = applyMoves(stateFromScramble(`${MOCK.scramble} ${prefix.join(' ')}`.trim()), row.best);
    assert.equal(crossSolved(state, 'D'), true, `position ${row.i}`);
    assert.equal(row.best.length, row.d);
  }
});

test('colour-neutral cross on F: losses are computed in the solve\'s own frame', () => {
  const g = GOLD.cnF;
  const seg = segmentSolve({ scramble: g.scramble, moves: g.moves });
  const cross = evaluateCross({ segmentation: seg, firstMoves: false, faceLengths: false }, solver);
  assert.equal(cross.face, 'F');
  assert.equal(cross.userMoves, 8);
  assert.equal(cross.positions.at(-1).d, 0);
  // Same solve on D: same distances, because the two cubes are rotations of each other.
  const onD = segmentSolve({ scramble: GOLD.normal.scramble, moves: GOLD.normal.moves });
  const crossD = evaluateCross({ segmentation: onD, firstMoves: false, faceLengths: false }, solver);
  assert.deepEqual(cross.positions.map(p => p.d), crossD.positions.map(p => p.d));
  assert.equal(cross.totalLoss, crossD.totalLoss);
  assert.equal(cross.totalLoss, cross.userMoves - cross.d0);
});

test('a pseudo cross is measured in its own frame (no charge for the pending layer turn)', () => {
  const g = GOLD.pseudoXcross;
  const seg = segmentSolve({ scramble: g.scramble, moves: g.moves });
  assert.equal(seg.marks.crossIdx, 6);
  const cross = evaluateCross({ segmentation: seg, firstMoves: false, faceLengths: false }, solver);
  assert.equal(cross.frames, 'any');
  assert.equal(cross.shift, 3);
  assert.equal(cross.positions.at(-1).d, 0);
  assert.equal(cross.totalLoss, cross.userMoves - cross.d0);
  const plain = evaluateCross({ segmentation: seg, frames: 'plain', firstMoves: false, faceLengths: false }, solver);
  assert.equal(plain.positions.at(-1).d, 1, 'in the plain frame one aligning turn is still missing');
});

test('async API matches the sync one, caches, and cancels', async () => {
  const seg = mock();
  const sync = evaluateCross({ segmentation: seg }, solver);
  let calls = 0;
  const asyncSolver = { search: async request => { calls++; await null; return solver.search(request); } };
  const async = await evaluateCrossAsync({ segmentation: seg }, asyncSolver);
  assert.deepEqual(async, sync);
  assert.ok(calls > 50, 'queries go through the injected solver');

  const cached = cachedSolver(asyncSolver);
  const before = calls;
  await evaluateCrossAsync({ segmentation: seg }, cached);
  const first = calls - before;
  await evaluateCrossAsync({ segmentation: seg }, cached);
  assert.equal(calls - before, first, 'the second evaluation is served from the cache');

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => evaluateCrossAsync({ segmentation: seg }, asyncSolver, { signal: controller.signal }), { name: 'AbortError' });
});

test('analyzeSolve and the worker-style message handler return plain clonable data', async () => {
  const input = { scramble: MOCK.scramble, moves: MOCK.cross };
  const direct = analyzeSolve(input, solver);
  assert.equal(direct.segmentation.crossFace, 'D');
  assert.equal(direct.cross.totalLoss, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(direct)), direct, 'results survive a JSON or structured-clone round trip');
  assert.equal(analyzeSolve(input, null).cross, null);
  assert.equal((await analyzeSolveAsync(input, solver)).cross.d0, 6);

  const posted = [];
  const onMessage = createAnalysisHandler(solver, message => posted.push(message));
  await onMessage({ type: 'analyze', id: 7, input });
  await onMessage({ type: 'analyze', id: 8, input: { scramble: 'R', moves: ['Rw'] } });
  await onMessage({ type: 'ignored', id: 9 });
  assert.equal(posted.length, 2);
  assert.deepEqual(posted[0].result.cross.positions.map(p => p.d), [6, 5, 4, 3, 4, 3, 2, 1, 0]);
  assert.equal(posted[0].id, 7);
  assert.equal(posted[1].type, 'error');
});

test('cross evaluation speed (warm, real WASM)', () => {
  const seg = mock();
  evaluateCross({ segmentation: seg }, solver);
  const start = performance.now();
  evaluateCross({ segmentation: seg }, solver);
  const warmMs = performance.now() - start;
  assert.ok(warmMs < 1000, `warm evaluation took ${warmMs.toFixed(0)} ms`);
});
