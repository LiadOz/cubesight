import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarkers, PROMINENT } from '../src/brain/review/markers.js';
import { reviewBaselines, medianGap } from '../src/brain/review/baselines.js';
import { MOCK } from './analysis-golden.mjs';
import { replayRecord, timesFor, analysed, PLAN, FACE_COLORS } from './helpers/review-fixtures.mjs';

// Markers are built from a stored record + its analysis summary; the analysis is the real WASM
// solver in node (the worker does the same in the app).

const crossRecord = async ({ pauses = {} } = {}) => {
  const moves = MOCK.cross.split(' ');
  return analysed({
    at: 1000, scramble: MOCK.scramble, solveMoves: moves, moveCount: moves.length, solved: true, crossFace: 'D', tps: 4, rotations: 0,
    moveTimes: timesFor(moves.length, { pauses }), splits: [{ key: 'cross', ms: 2300, moves: 8 }],
  });
};
const crossRows = [{ key: 'cross', startAt: 0, endAt: 2300, ms: 2300, moves: 8, skipped: false, merged: false }];
const others = (n, patch = {}) => Array.from({ length: n }, (_, i) => ({ at: i, solved: true, rotations: 1, moveTimes: timesFor(40, { step: 600 }), ...patch }));
const fullRows = () => PLAN.map(p => ({ key: p.key, moves: 12, ms: 1000, skipped: false, merged: false }));

test('the mock cross (SPEC 4.1) gives a detour marker on move 4 with the shorter finish to animate', async () => {
  const record = await crossRecord();
  const { markers, defaultId } = buildMarkers({ record, stages: crossRows, plan: PLAN, faceColors: FACE_COLORS });
  const detour = markers.find(m => m.kind === 'detour');
  assert.ok(detour, 'the fourth move is a detour');
  assert.equal(detour.idx, 3);
  assert.equal(detour.at, 3, 'the cube shows the position before the detour');
  assert.equal(detour.stage, 'cross');
  assert.equal(detour.rawCost, 2);
  assert.match(detour.note, /^Move 4, D: that turned you away from the cross\. The shortest way home from here was .+, 3 more moves; you took 5 more \(6 vs your 8\)\.$/);
  assert.equal(detour.better.moves.length, 3);
  assert.deepEqual(detour.better.yours, MOCK.cross.split(' ').slice(3));
  assert.equal(detour.trainer, 'cross');
  assert.equal(defaultId, detour.id, 'the most costly moment is selected by default');
});

test('markers rank by cost, the top few are prominent, and none are dropped', async () => {
  const base = await replayRecord();
  const record = await analysed({ ...base, moveTimes: timesFor(base.solveMoves.length, { pauses: { 20: 1800 } }) });
  const { markers, prominentIds } = buildMarkers({ record, stages: fullRows(), plan: PLAN, faceColors: FACE_COLORS });
  const a = record.analysis;
  const expected = a.cross.losses.length + a.pauses.length + a.cancels.length + record.rotationMarks.length + a.pseudo.length
    + a.skips.filter(s => s.kind !== 'xcross').length + (a.xcross ? 1 : 0) + 1;   // + the better cross
  assert.equal(markers.length, expected, 'every fact becomes a marker');
  assert.equal(markers.length > PROMINENT, true);
  assert.equal(markers.filter(m => m.prominent).length, PROMINENT);
  assert.equal(prominentIds.length, PROMINENT);
  assert.ok(markers.some(m => m.prominent && m.tone === 'good'), 'at least one good moment is prominent');
  assert.ok(markers.every((m, i) => m.rank === i + 1 && m.note && m.label && Number.isInteger(m.idx) && m.stage));
  // Ranked by score (the good-moment guarantee may promote one below the cut, but the order itself is by score).
  assert.deepEqual(markers.map(m => m.score), markers.map(m => m.score).sort((x, y) => y - x));
});

test('rotations come from the recorded gyro marks and compare with your average', async () => {
  const base = await replayRecord();
  assert.ok(base.rotationMarks.length >= 3);
  const record = await analysed({ ...base, moveTimes: timesFor(base.solveMoves.length) });
  const solo = buildMarkers({ record, stages: fullRows(), plan: PLAN });
  assert.equal(solo.markers.filter(m => m.kind === 'rotation').length, record.rotationMarks.length);
  assert.ok(solo.markers.filter(m => m.kind === 'rotation').every(m => m.compare === null), 'no baseline, no comparison');
  const baselines = reviewBaselines(others(5));
  const { markers } = buildMarkers({ record, stages: fullRows(), plan: PLAN, baselines });
  const rotation = markers.find(m => m.kind === 'rotation');
  assert.equal(rotation.compare, 'you average 1');
  assert.match(rotation.note, new RegExp(`^${record.rotationMarks.length} rotations this solve · you average 1\\.`));
  assert.equal(rotation.trainer, 'lookahead');
});

test('a pause compares with your usual gap; the focus changes the ranking', async () => {
  const record = await crossRecord({ pauses: { 5: 1400 } });
  const baselines = reviewBaselines(others(4));
  assert.equal(baselines.medianGapMs, 600);
  const speed = buildMarkers({ record, stages: crossRows, plan: PLAN, baselines, focus: 'speed' });
  const pause = speed.markers.find(m => m.kind === 'pause');
  assert.ok(pause, 'the stop is a pause');
  assert.equal(pause.compare, 'usual 0.6 s');
  assert.match(pause.note, /^1\.7 s stop before .+ \(you usually move every 0\.6 s\)\./);
  assert.equal(pause.trainer, 'lookahead');
  const flow = buildMarkers({ record, stages: crossRows, plan: PLAN, baselines, focus: 'flow' });
  const learning = buildMarkers({ record, stages: crossRows, plan: PLAN, baselines, focus: 'learning' });
  const scoreOf = (r, kind) => r.markers.find(m => m.kind === kind).score;
  assert.ok(scoreOf(flow, 'pause') > scoreOf(speed, 'pause') && scoreOf(speed, 'pause') > scoreOf(learning, 'pause'), 'flow weighs pauses up, learning down');
  assert.ok(scoreOf(learning, 'detour') > scoreOf(speed, 'detour'), 'learning weighs move efficiency up');
});

test('baselines stay within what was asked: too few solves means no comparison', () => {
  assert.equal(reviewBaselines(others(2)).reliable, false);
  assert.equal(reviewBaselines(others(2)).rotations, null);
  assert.equal(reviewBaselines(others(3)).reliable, true);
  assert.equal(medianGap([0, 100, 200, 600, 700]), 100);
  assert.equal(medianGap([1, 2]), null);
});

test('without an analysis (a free solve, an old record) only the recorded rotations show', () => {
  const record = { at: 1, solveMoves: ['R', 'U'], moveCount: 2, rotationMarks: [{ idx: 1, tMs: 400 }], solveMs: 900 };
  const { markers, defaultId } = buildMarkers({ record, stages: [], plan: PLAN });
  assert.deepEqual(markers.map(m => m.kind), ['rotation']);
  assert.equal(defaultId, markers[0].id);
  assert.deepEqual(buildMarkers({ record: null }).markers, []);
});
