import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeRetry, retryPlan, retryRegradeRecord, stateAfter } from '../src/review/replay.js';
import { graphPath, labelsFor, stageScores, keyMoments } from '../src/review/view-model.js';

const record = {
  at: 77, source: 'import', scramble: 'R U', solveMoves: ["U'", "R'", 'F', "F'"], moveCount: 4,
  solveMs: null, moveTimes: null, solved: false,
  analysis: {
    face: 'D', cross: { d0: 4, total: 1, best: "U' R'" },
    marks: { cross: 1, pairs: [null, null, null, null], eo: null, co: null, cp: null, solved: null },
    pairs: [], skips: [], pauses: [], cancels: [{ from: 2, to: 3, waste: 1 }],
  },
};

test('review labels and stage efficiency do not invent timing for imports', () => {
  const labels = labelsFor(record);
  assert.equal(labels[2][0].text, 'Cancel');
  assert.ok(!labels.flat().some(label => /pause|slow recog|flow/i.test(label.text)));
  const scores = stageScores(record);
  assert.equal(scores.length, 4);
  assert.equal(scores[0].label, 'Cross');
  assert.equal(scores.at(-1).label, 'Overall');
  assert.ok(keyMoments(record).some(moment => moment.label === 'Cross complete'));
});

test('retry sets up the exact selected prefix, accepts a physical attempt, and grades its efficiency', () => {
  const plan = retryPlan(record, 0);
  assert.deepEqual(plan.expected, ["U'", "R'"]);
  assert.equal(gradeRetry(plan, plan.expected).exact, true);
  assert.equal(gradeRetry(plan, plan.expected).efficiency, 100);
  assert.equal(gradeRetry(plan, ['F', "F'"]).exact, false);
  const regrade = retryRegradeRecord(record, plan, plan.expected);
  assert.equal(regrade.moveTimes, undefined);
  assert.deepEqual(regrade.solveMoves, [...plan.expected, ...record.solveMoves.slice(plan.to)]);
  assert.deepEqual(stateAfter(regrade, regrade.solveMoves.length), stateAfter(record, record.solveMoves.length));
});

test('replay applies records longer than parser chunks without truncation', () => {
  const long = { ...record, solveMoves: Array.from({ length: 275 }, (_, i) => ['R', 'U', "R'", "U'"][i % 4]), moveCount: 275 };
  assert.ok(stateAfter(long, 275));
  const plan = retryPlan(long, 210);
  assert.equal(plan.from, 210);
  assert.equal(plan.setup.length, 212);
});


const mockCross = {
  solveMoves: ["F'", "D'", 'F', 'D', 'B', "D'", 'R', "D'"],
  analysis: { cross: { d0: 6, total: 2, done: true, proven: true, losses: [{ i: 3, loss: 2, d: 3, after: 4, best: "R D' F" }] }, marks: { cross: 7, pairs: [] }, cancels: [], pauses: [] },
};
test('SPEC golden mock cross has seven Optimal moves, one Detour, and 80% efficiency', () => {
  const labels = labelsFor(mockCross).flat();
  assert.equal(labels.filter(label => label.text === 'Optimal').length, 7);
  assert.equal(labels.filter(label => label.text === 'Detour').length, 1);
  assert.equal(stageScores(mockCross)[0].accuracy, 80);
  assert.equal(stageScores(mockCross).at(-1).accuracy, 80, 'skipped F2L and LL add no reference weight');
});
test('a cancel already charged by the distance curve is not charged twice', () => {
  const r = { ...mockCross, analysis: { ...mockCross.analysis, cancels: [{ from: 3, to: 4, waste: 2 }] } };
  assert.equal(stageScores(r)[0].loss, 2);
  assert.equal(stageScores(r)[0].accuracy, 80);
});
test('imports hide stale time labels and incomplete cached losses cannot imply Optimal', () => {
  const r = { ...mockCross, analysis: { ...mockCross.analysis, cross: { ...mockCross.analysis.cross, total: 4 }, pauses: [{ i: 1, ms: 5000, allow: 350 }] } };
  const labels = labelsFor(r).flat();
  assert.ok(!labels.some(label => label.text === 'Optimal'));
  assert.ok(!labels.some(label => label.text === 'Pause'));
  assert.ok(labels.some(label => label.text === 'Fine'));
});
test('gyro rotation loss is capped at six across the whole solve and absent without gyro', () => {
  const r = { ...record, gyro: true, rotationMarks: [{ idx: 0 }, { idx: 1 }, { idx: 2 }, { idx: 3 }], analysis: { ...record.analysis, cross: null, cancels: [] } };
  assert.equal(stageScores(r).at(-1).loss, 6);
  assert.equal(stageScores({ ...r, gyro: false }).at(-1).loss, 0);
  assert.ok(!labelsFor({ ...r, gyro: false }).flat().some(label => label.text === 'Rotation'));
});
test('time graph uses cumulative stamps and loss units, with a move-axis option', () => {
  const r = { ...mockCross, moveTimes: [0, 100, 300, 600, 900, 1200, 1600, 2000] };
  const graph = graphPath(r, labelsFor(r));
  assert.ok(graph.includes('L101.6,90.0'), 'third move is at 300/2000 of the width');
  assert.ok(graph.endsWith('L632.0,108.0'), 'two lost moves, not one warning badge');
  assert.ok(graphPath(r, labelsFor(r), 640, 180, 'moves').includes('L242.0,90.0'));
});
test('all four pair completions appear as key moments', () => {
  const r = { ...record, analysis: { ...record.analysis, marks: { cross: -1, pairs: [0, 1, 2, 3] } } };
  assert.equal(keyMoments(r).filter(moment => /^Pair/.test(moment.label)).length, 4);
});
test('verified chosen-slot references use STM and include cancels once; one-move options are not Better pair', () => {
  const r = { ...record, analysis: { ...record.analysis, cross: null, marks: { cross: -1, pairs: [3] }, pairs: [{ from: 0, to: 3, yours: "U' R' F F'", chosenShortest: 2, chosenProven: true, shortest: 1, w: 12, better: { moves: "U' R' F", stm: 3, w: 10 } }] } };
  assert.equal(stageScores(r)[1].ref, 2);
  assert.equal(stageScores(r)[1].loss, 2);
  assert.ok(!labelsFor(r).flat().some(label => label.text === 'Better pair'));
});
