import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMoves, createSolvedState, sameCubeState, stateFromScramble, validateSolution } from '../src/cross-cube.js';
import { crossSolved, solvedPairs } from '../src/solve-tracker.js';
import { segmentSolve, findCancellations, STAGES } from '../src/analysis/segment.js';
import { inferCrossFace, relabelMoves, unrelabelMoves, toMoveList } from '../src/analysis/normalize.js';
import { GOLD, MOCK } from './analysis-golden.mjs';

const list = g => g.moves.split(' ');
const seg = (g, extra = {}) => segmentSolve({ scramble: g.scramble, moves: g.moves, ...extra });
// State after the first n solution moves, on the real model, in the solve's own frame.
const after = (g, n) => applyMoves(stateFromScramble(g.scramble), list(g).slice(0, n));
const frameOf = (r, i) => r.frames[i];
const slotsAt = (r, i) => frameOf(r, i).pairs;
const SHIFT_MOVE = { 1: 'D', 2: 'D2', 3: "D'" };

test('every golden solve replays to a solved cube on the real state model', () => {
  for (const [name, g] of Object.entries(GOLD)) {
    assert.equal(sameCubeState(after(g, list(g).length), createSolvedState()), true, name);
    assert.notEqual(sameCubeState(stateFromScramble(g.scramble), createSolvedState()), true, `${name} starts scrambled`);
  }
});

test('imported setup and review replay can analyze over 200 moves without weakening public entry limits', () => {
  const setup = Array(201).fill('R');
  const solution = Array(201).fill("R'");
  const result = segmentSolve({ scramble: setup, moves: solution });
  assert.equal(result.solved, true);
  assert.equal(result.frames.length, 201);
  assert.equal(inferCrossFace({ scramble: setup, moves: solution }).source, 'inferred');
  assert.throws(() => stateFromScramble(setup.join(' ')), /at most 200 moves/);
  assert.throws(() => segmentSolve({ scramble: Array(10_001).fill('R'), moves: [] }), /10000 setup moves/);
});

test('normal CFOP solve: cross, four pairs, EO, CO, PLL boundaries and stages', () => {
  const r = seg(GOLD.normal);
  assert.equal(r.crossFace, 'D');
  assert.equal(r.solved, true);
  assert.equal(r.frames.length, 51);
  assert.deepEqual(r.warnings, []);
  // A = 8 moves (idx 0-7), each pair commutator is 4 moves placed after its third move.
  assert.deepEqual(r.marks, {
    crossIdx: 7, pairIdx: [10, 14, 18, 22], eoIdx: 29, coIdx: 36, cpIdx: 50, solvedIdx: 50, ollIdx: 36, pairFrame: [0, 0, 0, 0],
  });
  assert.deepEqual(r.skips, []);
  assert.deepEqual(r.offsets, []);
  assert.equal(r.xcross.kind, 'cross');
  // The stage each move belongs to.
  const stageOf = i => r.frames[i].stage;
  assert.deepEqual([0, 7].map(stageOf), ['cross', 'cross']);
  assert.deepEqual([8, 10].map(stageOf), ['pair1', 'pair1']);
  assert.deepEqual([11, 14].map(stageOf), ['pair2', 'pair2']);
  assert.deepEqual([15, 18].map(stageOf), ['pair3', 'pair3']);
  assert.deepEqual([19, 22].map(stageOf), ['pair4', 'pair4']);
  assert.deepEqual([23, 29].map(stageOf), ['eo', 'eo']);
  assert.deepEqual([30, 36].map(stageOf), ['co', 'co']);
  assert.deepEqual([37, 50].map(stageOf), ['cp', 'cp']);
  assert.deepEqual(r.frames.filter(f => f.events.length).map(f => [f.i, f.events.join('+')]), [
    [7, 'cross'], [10, 'pair1'], [14, 'pair2'], [18, 'pair3'], [22, 'pair4'], [29, 'eo'], [36, 'co'], [50, 'cp+ep'],
  ]);
  assert.deepEqual(r.stages.map(s => [s.name, s.moves, s.skipped]), [
    ['cross', 8, false], ['pair1', 3, false], ['pair2', 4, false], ['pair3', 4, false], ['pair4', 4, false],
    ['eo', 7, false], ['co', 7, false], ['cp', 14, false], ['ep', 0, true],
  ]);
  assert.deepEqual(r.stages.map(s => s.name), [...STAGES]);
  assert.deepEqual(r.pairs.map(p => [p.slot, p.idx, p.k, p.pseudo]), [['FR', 10, 0, false], ['FL', 14, 0, false], ['BR', 18, 0, false], ['BL', 22, 0, false]]);
  assert.deepEqual(r.frames[8].group, 'f2l');
});

test('normal solve: stage marks agree with independent checks on the real state model', () => {
  const g = GOLD.normal;
  const r = seg(g);
  // Cross: solved after move idx 7 (8 moves played) and not one move earlier.
  assert.equal(validateSolution(after(g, 8), [], 'D').crossSolved, true);
  assert.equal(validateSolution(after(g, 7), [], 'D').crossSolved, false);
  // Pairs: the plain pair count (the model's own validator) first reaches n + 1 exactly at pairIdx[n].
  const counts = Array.from({ length: 52 }, (_, played) => validateSolution(after(g, played), [], 'D').pairs.length);
  r.marks.pairIdx.forEach((idx, n) => {
    assert.equal(counts.findIndex((count, played) => played > 7 && count >= n + 1), idx + 1, `pair ${n + 1} first in place after move ${idx}`);
  });
  assert.equal(sameCubeState(after(g, 51), createSolvedState()), true);
  assert.equal(sameCubeState(after(g, 50), createSolvedState()), false);
});

test('x-cross: a pair already in place on the move the cross completes', () => {
  const r = seg(GOLD.xcross);
  assert.deepEqual(r.marks.pairIdx, [7, 10, 14, 18]);
  assert.equal(r.marks.crossIdx, 7);
  assert.deepEqual(r.xcross, { kind: 'xcross', pairs: 1, pseudo: false, slots: ['FR'] });
  assert.deepEqual(r.skips.filter(s => s.kind === 'xcross').map(s => [s.idx, s.count]), [[7, 1]]);
  assert.equal(r.stages[1].skipped, true, 'pair1 stage has no moves of its own');
  assert.deepEqual(r.frames[7].events, ['cross', 'pair1']);
  assert.equal(r.frames[8].stage, 'pair2');
});

test('a pseudo pair created and fixed: frame k, offset interval, D fix, plain later', () => {
  const g = GOLD.pseudoPair;
  const r = seg(g);
  // FR plain (idx 8-11), then D (12) L' U' L U (13-16) D' (17): FL is placed in frame k=3.
  assert.deepEqual(r.marks.pairIdx, [10, 15, 20, 24]);
  assert.deepEqual(r.marks.pairFrame, [0, 3, 0, 0]);
  assert.deepEqual(r.pairs[1], { n: 2, slot: 'FL', slotOriginal: 'FL', idx: 15, k: 3, pseudo: true, plainIdx: 17 });
  assert.equal(r.pairs[0].pseudo, false);
  assert.deepEqual(r.offsets, [{ k: 3, ks: [3], createdAt: 12, resolvedAt: 17, pairs: ['FL'], used: true, stray: false }]);
  assert.equal(r.frames[12].offset, 'created');
  assert.equal(r.frames[17].offset, 'resolved');
  assert.equal(r.frames[17].dFix, true, 'the D turn that resolves a used offset is labelled, not waste');
  assert.deepEqual(r.frames.filter(f => f.dFix).map(f => f.i), [17]);
  assert.deepEqual(r.frames.slice(12, 18).map(f => f.k), [3, 3, 3, 3, 3, 0]);
  assert.deepEqual(r.frames.filter(f => f.pseudo).map(f => f.i), [12, 15, 16]);
  // Independent check with the model's own validator: in place after a D' turn, not plain.
  assert.equal(validateSolution(after(g, 16), [SHIFT_MOVE[3]], 'D').pairs.some(p => p.slot === 'FL'), true);
  assert.equal(validateSolution(after(g, 16), [], 'D').pairs.some(p => p.slot === 'FL'), false);
  assert.equal(validateSolution(after(g, 18), [], 'D').pairs.some(p => p.slot === 'FL'), true);
  assert.equal(r.skips.length, 0);
  assert.equal(r.solved, true);
});

test('mixed frames between pairs: each pair records the frame it was solved in', () => {
  const g = GOLD.mixed;
  const r = seg(g);
  assert.equal(r.marks.crossIdx, 6);
  assert.deepEqual(r.marks.pairIdx, [10, 15, 20, 25]);
  assert.deepEqual(r.marks.pairFrame, [3, 0, 1, 0]);
  assert.deepEqual(r.pairs.map(p => [p.slot, p.k, p.plainIdx]), [['FR', 3, 12], ['FL', 0, 15], ['BR', 1, 22], ['BL', 0, 25]]);
  assert.deepEqual(r.offsets.map(o => [o.k, o.createdAt, o.resolvedAt, o.used]), [[3, 7, 12, true], [1, 17, 22, true]]);
  assert.deepEqual(r.frames.filter(f => f.dFix).map(f => f.i), [12, 22]);
  // Pairs valid in the frame at each point: a solved pair keeps counting after the next fix.
  assert.deepEqual(slotsAt(r, 12), ['FR']);
  assert.equal(slotsAt(r, 15).length, 2);
  assert.equal(validateSolution(after(g, 21), [SHIFT_MOVE[1]], 'D').pairs.some(p => p.slot === 'BR'), true);
});

test('pseudo last pair merged with the AUF: PLL skip survives the pending D fix', () => {
  for (const [name, fixIdx, pairPlain] of [['pseudoLastUD', 22, 22], ['pseudoLastDU', 21, 21]]) {
    const g = GOLD[name];
    const r = seg(g);
    // FR 8-11, FL 12-15, D 16, BL-commutator 17-20, then the AUF and the D fix in either order.
    assert.deepEqual(r.marks.pairFrame, [0, 0, 3, 3], name);
    assert.deepEqual(r.marks.pairIdx, [10, 14, 19, 19], name);
    assert.equal(r.marks.eoIdx, 19);
    assert.equal(r.marks.coIdx, 19);
    assert.equal(r.marks.ollIdx, 19);
    assert.equal(r.marks.solvedIdx, 22);
    assert.deepEqual(r.skips.map(s => s.kind), ['pair', 'oll', 'pll'], name);
    assert.equal(r.skips.find(s => s.kind === 'pll').withOll, true);
    assert.deepEqual(r.frames.filter(f => f.dFix).map(f => f.i), [fixIdx], name);
    assert.equal(r.pairs[3].plainIdx, pairPlain, name);
    assert.equal(r.frames[19].k, 3, 'F2L ends with the D layer still offset');
    assert.equal(r.solved, true);
  }
});

test('OLL and PLL skips: EO skip then PLL skip, OLL skip, OLL+PLL skip, CP skip', () => {
  const eh = seg(GOLD.ehSkip);
  assert.deepEqual(eh.skips, [{ kind: 'eo', idx: 22 }, { kind: 'pll', idx: 30, withOll: false }]);
  assert.equal(eh.marks.solvedIdx, 31, 'the trailing AUF finishes the solve');
  assert.equal(eh.stages.find(s => s.name === 'eo').skipped, true);

  const oll = seg(GOLD.ollSkip);
  assert.deepEqual(oll.skips, [{ kind: 'oll', idx: 22 }]);
  assert.equal(oll.marks.cpIdx, 37, 'the T-perm still has to run');

  const both = seg(GOLD.ollPllSkip);
  assert.deepEqual(both.skips, [{ kind: 'oll', idx: 22 }, { kind: 'pll', idx: 22, withOll: true }]);
  assert.equal(both.marks.cpIdx, 22);
  assert.equal(both.marks.solvedIdx, 24);

  const cp = seg(GOLD.cpSkip);
  assert.deepEqual(cp.skips, [{ kind: 'cp', idx: 36 }]);
  assert.equal(cp.marks.cpIdx, cp.marks.ollIdx);
  assert.equal(cp.marks.solvedIdx, 47);
});

test('a pair that lands on the same move as the previous pair is a multi-pair skip', () => {
  const r = seg(GOLD.pseudoLastUD);
  assert.deepEqual(r.skips[0], { kind: 'pair', idx: 19, count: 2, pseudo: true, slots: ['BR', 'BL'] });
});

test('cancellations: same-axis neighbours that reduce', () => {
  const r = seg(GOLD.cancel);
  assert.deepEqual(r.cancellations.map(c => [c.from, c.to, c.waste, c.moves.join(' ')]), [
    [11, 12, 1, "U' U'"],
    [37, 38, 2, "R' R"],
  ]);
  assert.deepEqual(r.cancellations[0].stages, ['pair2']);
  assert.equal(r.frames[11].cancel.first, true);
  assert.equal(r.frames[12].cancel.first, false);
  assert.equal(r.frames[13].cancel, null);

  assert.deepEqual(findCancellations(['R', 'L', "R'"]).map(c => c.waste), [2]);
  assert.deepEqual(findCancellations(['R', 'U', "R'"]), []);
  assert.deepEqual(findCancellations(['U', 'U']).map(c => c.waste), [1]);
  assert.deepEqual(findCancellations(['R2', 'R2']).map(c => c.waste), [2]);
  assert.deepEqual(findCancellations(['D', 'U', "D'"]).map(c => c.waste), [2]);
  assert.deepEqual(findCancellations(['F', 'B', 'R', "F'"]).map(c => [c.from, c.to, c.waste]), []);
  assert.deepEqual(findCancellations(['R', 'R', 'L', 'L']).map(c => c.waste), [2]);
});

test('stray offset: a layer turn that is undone without placing a pair', () => {
  const r = seg(GOLD.stray);
  assert.deepEqual(r.offsets, [{ k: 3, ks: [3], createdAt: 12, resolvedAt: 14, pairs: [], used: false, stray: true }]);
  assert.deepEqual(r.frames.filter(f => f.dFix), [], 'an unused offset has no labelled D fix');
  assert.deepEqual(r.marks.pairFrame, [0, 0, 0, 0]);
  assert.equal(r.solved, true);
});

test('pseudo X-cross: the cross is solved in an offset frame and a pair comes with it', () => {
  const g = GOLD.pseudoXcross;
  const r = seg(g);
  assert.equal(r.marks.crossIdx, 6, 'the cross is done in frame k=3, not aligned');
  assert.deepEqual(r.xcross, { kind: 'xcross', pairs: 1, pseudo: true, slots: ['BR'] });
  assert.deepEqual(r.skips.map(s => s.kind), ['xcross', 'pair']);
  assert.equal(r.frames[6].k, 3);
  assert.equal(r.offsets.length, 1);
  assert.equal(r.offsets[0].createdAt, 6);
  assert.equal(r.offsets[0].resolvedAt, 42, 'the final D turn is the fix');
  assert.equal(r.frames[42].dFix, true);
  assert.equal(r.marks.solvedIdx, 42);
  assert.equal(validateSolution(after(g, 7), ["D'"], 'D').crossSolved, true);
  assert.equal(validateSolution(after(g, 7), [], 'D').crossSolved, false);
});

test('ordinary cross alignment is part of the cross, not a pseudo offset', () => {
  // The last cross move of A is D': the cross is aligned with the other edges one move earlier.
  const r = seg(GOLD.normal);
  assert.equal(r.marks.crossIdx, 7);
  assert.equal(r.frames[6].kNow, 3, 'raw frame read: solved in frame 3 before the aligning turn');
  assert.equal(r.frames[6].k, null, 'but no frame is held yet');
  assert.deepEqual(r.offsets, []);
});

test('real mock solve: SPEC pseudo trace 0, 3, null, null, 3, 0 and the BL pair', () => {
  const moves = `${MOCK.cross} ${MOCK.blPseudo}`;
  const r = segmentSolve({ scramble: MOCK.scramble, moves });
  assert.equal(r.crossFace, 'D');
  assert.equal(r.marks.crossIdx, 7);
  assert.deepEqual(r.frames.slice(7, 13).map(f => f.kNow), [0, 3, null, null, 3, 0]);
  assert.deepEqual(r.frames.slice(7, 13).map(f => f.pairs.join('')), ['', '', '', '', 'BL', 'BL']);
  assert.deepEqual(r.pairs.map(p => [p.slot, p.idx, p.k, p.plainIdx]), [['BL', 11, 3, 12]]);
  assert.equal(r.frames[12].dFix, true);
  assert.equal(r.solved, false);
  assert.ok(r.warnings.includes('not-solved'));
});

test('colour-neutral solves: the same solve with the cross on U, F or L', () => {
  const base = seg(GOLD.normal);
  for (const [name, face] of [['cnU', 'U'], ['cnF', 'F'], ['cnL', 'L']]) {
    const g = GOLD[name];
    const r = seg(g);
    assert.equal(r.crossFace, face, name);
    assert.equal(r.crossSource, 'inferred');
    assert.deepEqual(r.marks, base.marks, name);
    assert.deepEqual(r.normalized.moves, list(GOLD.normal), `${name} normalises to the cross-on-D solve`);
    assert.deepEqual(r.moves, list(g));
    assert.equal(r.solved, true);
    // Independent, in the solve's own frame (no relabelling): the cross on `face` completes at idx 7 and pairs follow.
    assert.equal(crossSolved(after(g, 8), face), true, name);
    assert.equal(crossSolved(after(g, 7), face), false, name);
    assert.equal(solvedPairs(after(g, 11), face).length, 1, name);
    assert.equal(solvedPairs(after(g, 10), face).length, 0, name);
    assert.equal(solvedPairs(after(g, 23), face).length, 4, name);
    // Original-frame slot names map back: pair order FR, FL, BR, BL on D is the same four slots.
    assert.equal(new Set(r.pairs.map(p => p.slotOriginal)).size, 4);
    assert.equal(sameCubeState(after(g, 51), createSolvedState()), true);
  }
});

test('orientation input picks the cross face and is used over inference', () => {
  const g = GOLD.cnF;
  assert.equal(seg(g, { orient: 'F' }).crossSource, 'orient');
  assert.equal(seg(g, { orient: { bottom: 'F' } }).crossFace, 'F');
  // Sparse gyro samples [i, bottom, front]: held U for a while, F when the cross completes.
  const gyro = seg(g, { orient: [[0, 'U', 'F'], [5, 'F', 'U']] });
  assert.equal(gyro.crossFace, 'F');
  assert.equal(gyro.marks.crossIdx, 7);
  // A held bottom that never finishes a cross: fall back to it, with a warning.
  const wrong = seg(g, { orient: [[0, 'U', 'F']] });
  assert.equal(wrong.crossFace, 'U');
  assert.equal(wrong.crossSource, 'orient');
  assert.notEqual(wrong.marks.crossIdx, 7, 'a U cross is not what this solve built');
  // An explicit face wins.
  assert.equal(seg(g, { crossFace: 'F' }).crossSource, 'given');
});

test('relabelling is a rotation: unrelabel inverts relabel and solves stay solved', () => {
  for (const face of ['D', 'U', 'F', 'B', 'R', 'L']) {
    const moves = list(GOLD.normal);
    assert.deepEqual(unrelabelMoves(relabelMoves(moves, face), face), moves);
    const scramble = GOLD.normal.scramble.split(' ');
    const state = applyMoves(applyMoves(createSolvedState(), relabelMoves(scramble, face)), relabelMoves(moves, face));
    assert.equal(sameCubeState(state, createSolvedState()), true, face);
    // The cross on `face` in the original solve is the cross on D after relabelling.
    const original = applyMoves(stateFromScramble(unrelabelMoves(scramble, face).join(' ')), unrelabelMoves(moves.slice(0, 8), face));
    assert.equal(crossSolved(original, face), true, face);
  }
});

test('timing: stage times, gaps and pauses against the median gap', () => {
  const g = GOLD.normal;
  // 200 ms per move, with deliberate stops before moves 8 (cross to pair 1), 14 (inside a pair),
  // 20 (a short 500 ms gap, under the threshold) and 37 (OLL to PLL).
  const extra = { 8: 1400, 14: 700, 20: 300, 37: 1000 };
  const times = [];
  let t = 0;
  for (let i = 0; i < 51; i++) { t += i === 0 ? 0 : 200 + (extra[i] || 0); times.push(t); }
  const r = seg(g, { moveTimes: times });
  assert.equal(r.timing.hasTimes, true);
  assert.equal(r.timing.medianGapMs, 200);
  assert.equal(r.frames[8].gapMs, 1600);
  assert.equal(r.frames[0].gapMs, null);
  assert.deepEqual(r.pauses.map(p => [p.i, p.gapMs, p.boundary, p.allowMs, p.stage]), [
    [8, 1600, 'cross-f2l', 600, 'pair1'],
    [14, 900, 'inside', 350, 'pair2'],
    [37, 1200, 'oll-pll', 700, 'cp'],
  ]);
  assert.equal(r.pauses[0].excessMs, 1000);
  assert.equal(r.frames[8].pause.i, 8);
  assert.equal(r.frames[20].pause, null, 'a 500 ms gap is below both thresholds');
  assert.equal(r.milestones.find(m => m.stage === 'cross').t, times[7]);
  assert.equal(r.milestones.find(m => m.stage === 'pair1').t, times[10]);
  assert.equal(r.stages[0].ms, times[7] - times[0]);
  assert.equal(r.stages[1].ms, times[10] - times[7]);
  assert.equal(r.frames[10].t, times[10]);
});

test('without move times there are no pauses and timing is off', () => {
  const r = seg(GOLD.normal);
  assert.equal(r.timing.hasTimes, false);
  assert.deepEqual(r.pauses, []);
  assert.equal(r.frames[3].t, null);
  assert.equal(r.stages[0].ms, null);
  const bad = seg(GOLD.normal, { moveTimes: [0, 100] });
  assert.equal(bad.timing.hasTimes, false);
  assert.ok(bad.warnings.some(w => w.startsWith('moveTimes-ignored')));
});

test('inferCrossFace: first face whose cross completes; ties go to more pairs, then D U F B R L', () => {
  const g = GOLD.cnL;
  const hit = inferCrossFace({ scramble: g.scramble, moves: list(g) });
  // Position 7: the cross is first solved one aligning D turn away (frame 3); segmentSolve waits for the aligned position.
  assert.deepEqual([hit.face, hit.source, hit.index, hit.shift], ['L', 'inferred', 7, 3]);
  const none = inferCrossFace({ scramble: g.scramble, moves: [] });
  assert.deepEqual([none.face, none.source, none.index], ['D', 'default', null]);
  // A solved cube has every cross: nothing is "new" after a no-op, D wins the tie at position 0.
  assert.equal(inferCrossFace({ scramble: '', moves: [] }).face, 'D');
});

test('input validation: only outer-face turns, strings or arrays accepted', () => {
  assert.deepEqual(toMoveList("R U R'"), ['R', 'U', "R'"]);
  assert.deepEqual(toMoveList(['R2']), ['R2']);
  assert.throws(() => toMoveList(['Rw']), /outer-face/);
  assert.throws(() => toMoveList(['x']), /outer-face/);
  assert.throws(() => segmentSolve({ scramble: 'R U', moves: ['M'] }), /outer-face/);
  const fromArrays = segmentSolve({ scramble: GOLD.normal.scramble.split(' '), moves: list(GOLD.normal) });
  assert.equal(fromArrays.solved, true);
});

test('segmentation of a whole solve stays cheap', () => {
  const g = GOLD.normal;
  seg(g);
  const start = performance.now();
  for (let i = 0; i < 5; i++) seg(g);
  const each = (performance.now() - start) / 5;
  assert.ok(each < 250, `segmentSolve took ${each.toFixed(1)} ms per solve`);
});
