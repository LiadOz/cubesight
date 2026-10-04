import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupEndLabels } from '../src/brain/styles/orbit/end-labels.js';
import { fitBandLabels } from '../src/brain/charts/band-labels.js';
import { buildDetail, compareFor, positionedRows, comparisonDemoHref } from '../src/brain/review/detail.js';
import { buildMarkers } from '../src/brain/review/markers.js';
import { isMergedSplit } from '../src/brain/stage-plan.js';
import { cleanRecord } from '../src/solve-store.js';
import { parseDemoHash } from '../src/demo/model.js';
import { MOCK } from './analysis-golden.mjs';
import { timesFor, analysed, PLAN, FACE_COLORS } from './helpers/review-fixtures.mjs';

const seg = (key, state = 'done', merged = false) => ({ key, state, merged });

test('stages that end together share one ring label', () => {
  const groups = groupEndLabels([seg('cross'), seg('pair1'), seg('pair2'), seg('pair3'), seg('pair4'), seg('eo', 'skipped'), seg('co', 'skipped'), seg('cp', 'skipped'), seg('ep', 'skipped')], s => s.key);
  assert.equal(groups.length, 6);
  assert.deepEqual(groups.at(-1).keys, ['eo', 'co', 'cp', 'ep']);
  assert.equal(groups.at(-1).name, 'eo·co·cp·ep');
  assert.equal(groups.at(-1).value, 'skip');
  const merged = groupEndLabels([seg('cross'), seg('pair1', 'done', true), seg('pair2', 'done', true), seg('pair3')], s => s.key);
  assert.deepEqual(merged[1].keys, ['pair1', 'pair2']);
  assert.equal(merged[1].value, 'with cross');
  assert.equal(groupEndLabels([seg('eo', 'skipped'), seg('co')], s => s.key)[0].name, null, 'a lone skip keeps its own label');
});

test('chart band names shrink or drop instead of overlapping', () => {
  const measure = t => t.length * 7;
  const bands = [
    { label: 'cross', short: 'x', from: 0, to: 40 }, { label: 'pair 1', short: 'p1', from: 40, to: 70 },
    { label: 'pair 2', short: 'p2', from: 70, to: 150 }, { label: 'pair 3', short: 'p3', from: 150, to: 152 }, { label: 'pair 4', short: 'p4', from: 152, to: 154 },
  ];
  const names = fitBandLabels(bands, measure);
  assert.deepEqual(names.slice(0, 3), ['cross', 'p1', 'pair 2']);
  assert.equal(names[3], null, 'too narrow for anything');
  assert.equal(names[4], null);
});

test('merged pairs are explicit on the stored split, and a zero-time zero-move split still counts', () => {
  assert.equal(isMergedSplit({ key: 'pair2', merged: true, ms: 3, moves: 1 }), true);
  assert.equal(isMergedSplit({ key: 'pair2', ms: 0, moves: 0 }), true);
  assert.equal(isMergedSplit({ key: 'pair2', ms: 0, moves: 0, skipped: true }), false);
  assert.equal(cleanRecord({ at: 1, splits: [{ key: 'pair1', ms: 0, moves: 0, merged: true }] }).splits[0].merged, true);
});

test('detail view: stage stats, yours vs better, honest "no suggestion yet", and the pin payload', async () => {
  const moves = MOCK.cross.split(' ');
  const record = await analysed({
    at: 77, scramble: MOCK.scramble, solveMoves: moves, moveCount: moves.length, solved: true, crossFace: 'D', tps: 4, rotations: 0,
    moveTimes: timesFor(moves.length, { pauses: { 5: 1400 } }), splits: [{ key: 'cross', ms: 3700, moves: 8 }],
  });
  const rows = [{ key: 'cross', startAt: 0, endAt: 3700, ms: 3700, moves: 8, skipped: false, merged: false }, { key: 'pair3', startAt: 3700, endAt: 4000, ms: 300, moves: 0, skipped: true, merged: false }];
  const { markers } = buildMarkers({ record, stages: rows, plan: PLAN, faceColors: FACE_COLORS });
  const averages = { byKey: { cross: { avgMs: 4000, avgMoves: 12, source: 'history' } } };
  const stage = buildDetail({ kind: 'stage', key: 'cross', record, markers, rows, plan: PLAN, averages });
  assert.equal(stage.title, 'cross');
  assert.equal(stage.start, 0);
  assert.equal(stage.moves.length, 8);
  assert.equal(stage.stats.time, '3.70');
  assert.equal(stage.stats.delta, '−0.30');
  assert.equal(stage.stats.avgMoves, '12.0');
  assert.match(stage.stats.pauses, /^1 pause/);
  assert.equal(stage.compare.status, 'better');
  assert.equal(stage.compare.text, 'yours 8 · better 6');
  assert.equal(stage.compare.better.length, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(stage.compare)), stage.compare);
  const yoursDemo = parseDemoHash(comparisonDemoHref(stage.compare, stage.compare.yours));
  const betterDemo = parseDemoHash(comparisonDemoHref(stage.compare, stage.compare.better));
  assert.deepEqual(yoursDemo.parts[0].alg, stage.compare.yours);
  assert.deepEqual(betterDemo.parts[0].alg, stage.compare.better);
  assert.deepEqual(yoursDemo.parts[0].setup, MOCK.scramble.split(' '));
  assert.equal(yoursDemo.parts[0].colorSetting, 'yellow top');
  const pairDetail = buildDetail({ kind: 'stage', key: 'pair1', record: { ...record, analysis: { ...record.analysis, caseMetadata: { f2lCases: { pair1: { caseId: '8' } } } } }, rows: [...rows, { key: 'pair1', ms: 500, moves: 2 }], plan: PLAN });
  assert.equal(parseDemoHash(comparisonDemoHref(pairDetail.compare, ['R'])).parts[0].caseId, 'f2l/8');
  assert.equal(stage.moves.find(m => m.i === 3).flags.includes('detour'), true);
  assert.equal(stage.pin.payload.trainer, 'cross');
  assert.equal(stage.pin.payload.moveIdx, 0);
  assert.equal(stage.pin.pinned, false);
  assert.equal(buildDetail({ kind: 'stage', key: 'cross', record, markers, rows, plan: PLAN, pins: [{ at: 77, stage: 'cross', moveIdx: 0 }] }).pin.pinned, true);
  const skipped = buildDetail({ kind: 'stage', key: 'pair3', record, markers, rows, plan: PLAN });
  assert.equal(skipped.compare.status, 'skipped');
  const marker = buildDetail({ kind: 'marker', key: markers.find(m => m.kind === 'detour').id, record, markers, rows, plan: PLAN });
  assert.equal(marker.start, 3);
  assert.equal(marker.compare.text, 'yours 5 · better 3');
  assert.equal(marker.pin.payload.moveIdx, 3);
  assert.equal(marker.pin.payload.movesUpTo.length, 3);
  assert.equal(marker.pin.payload.kind, 'detour');
  assert.equal(compareFor({ row: { key: 'eo', from: 9, to: 12 }, record }).text, 'no suggestion yet');
  assert.equal(compareFor({ row: { key: 'cross', from: 0, to: 8 }, record, pending: true }).status, 'pending');
  const bounded = { ...record, analysis: { ...record.analysis, cross: { ...record.analysis.cross, extra: 0, proven: false } } };
  assert.match(compareFor({ row: { key: 'cross', from: 0, to: 8 }, record: bounded }).text, /no shorter completion found in this search/);
  const partialPair = compareFor({ row: { key: 'pair1', from: 0, to: 1 }, record: {
    solveMoves: ['R'], analysis: { pairs: [{ n: 1, from: 0, to: 1, yours: 'R', pendingUpgrade: true, options: [] }] },
  } });
  assert.match(partialPair.text, /first pass · checking for a shorter completion/);
  const provenPair = compareFor({ row: { key: 'pair1', from: 0, to: 1 }, record: {
    solveMoves: ['R'], analysis: { pairs: [{ n: 1, from: 0, to: 1, yours: 'R', shortest: 2, proven: true, better: { moves: 'U R' }, options: [] }] },
  } });
  assert.match(provenPair.text, /minimum 2 moves proven/);
  const framed = compareFor({
    row: { key: 'pair1', from: 0, to: 1 },
    record: { solveMoves: ['U'], analysis: { pairs: [{ n: 1, frame: 2, shortest: 2, proven: true, better: { moves: 'R U', goalShift: 1 }, options: [] }] } },
  });
  assert.equal(framed.text, 'same length · easier turns · minimum 2 moves proven · starts in D offset frame 2 · D offset finish');
  assert.equal(buildDetail({ kind: 'stage', key: 'zzz', record, markers, rows, plan: PLAN }), null);
  assert.deepEqual(positionedRows(rows, PLAN).map(r => [r.key, r.from, r.to]), [['cross', 0, 8], ['pair3', 8, 8]]);
});

test('a record that cannot be replayed opens a detail without a cube position', () => {
  const record = { at: 1, scramble: 'R U', solveMoves: ['R'], moveCount: 5 };
  const rows = [{ key: 'cross', moves: 5, ms: 1000, startAt: 0, endAt: 1000 }];
  const detail = buildDetail({ kind: 'stage', key: 'cross', record, rows, plan: PLAN });
  assert.equal(detail.replayable, false);
  assert.equal(detail.pin.available, false);
});
