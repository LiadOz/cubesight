import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStagePlan, planKey, planGroups, stageAverages, pbSplits, xcrossLabel, isMergedSplit, DEFAULT_SOLVE_MS } from '../src/brain/stage-plan.js';
import { createTrack, trackMilestones, stageProgress, splitsFromTrack } from '../src/brain/milestones.js';
import { tpsSeries, splitRows, donutArcs, sparkline } from '../src/brain/series.js';
import { fmtTime, fmtDelta, deltaTone, fmtResult, penaltyTag, fmtSeconds } from '../src/brain/format.js';
import { normalizeSettings } from '../src/brain/settings.js';

const keys = settings => buildStagePlan(normalizeSettings(settings)).map(s => s.key);

test('stage plans follow the method and 1-/2-look settings; x-cross is never a target', () => {
  assert.deepEqual(keys({}), ['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'eo', 'co', 'cp', 'ep']);
  assert.deepEqual(keys({ oll: '1look', pll: '1look' }), ['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'oll', 'pll']);
  // An old stored cross target is ignored: the plan always has the cross and four pairs.
  assert.deepEqual(keys({ cross: 'xcross' }), keys({}));
  assert.deepEqual(keys({ cross: 'xxcross', oll: '1look' }), ['cross', 'pair1', 'pair2', 'pair3', 'pair4', 'oll', 'cp', 'ep']);
  // Roux is hidden from the settings (normalises to cfop) but its plan is kept.
  assert.deepEqual(buildStagePlan({ ...normalizeSettings(), method: 'roux' }).map(s => s.key), ['fb', 'sb', 'cmll', 'l6e']);
  assert.deepEqual(keys({ method: 'roux' }), keys({}));
  assert.equal(buildStagePlan(normalizeSettings({ cross: 'xcross' }))[0].label, 'cross');
  assert.equal('cross' in normalizeSettings({ cross: 'xcross' }), false, 'the stored value is dropped');
  assert.equal(xcrossLabel(0), null);
  assert.equal(xcrossLabel(1), 'x-cross');
  assert.equal(xcrossLabel(2), 'xx-cross');
  const plan = buildStagePlan(normalizeSettings({ f2l: 'pseudo' }));
  assert.equal(planKey(plan), 'cross,pair1,pair2,pair3,pair4,eo,co,cp,ep');
  assert.deepEqual(planGroups(plan, { f2l: 'pseudo' }).map(g => [g.id, g.sub, g.from, g.to]), [['f2l', 'pseudo', 1, 4], ['oll', '2-look', 5, 6], ['pll', '2-look', 7, 8]]);
  assert.deepEqual(planGroups(buildStagePlan(normalizeSettings({ oll: '1look', pll: '1look' }))).map(g => g.id), ['f2l']);
});

test('stage averages: splits first, then legacy phases, then default shares', () => {
  const plan = buildStagePlan(normalizeSettings());
  const none = stageAverages([], plan);
  assert.ok(Math.abs(none.totalAvgMs - DEFAULT_SOLVE_MS) < 1, 'defaults scale to a typical solve');
  assert.equal(none.byKey.cross.source, 'default');
  const records = [
    { solveMs: 15000, solved: true, splits: [{ key: 'cross', ms: 2000, moves: 8 }, { key: 'eo', ms: 0, moves: 0, skipped: true }] },
    { solveMs: 17000, solved: true, splits: [{ key: 'cross', ms: 3000, moves: 10 }, { key: 'eo', ms: 1000, moves: 6 }] },
    { solveMs: 16000, solved: true, phases: { crossMs: 2500, f2lMs: 8000, ollMs: 2000, pllMs: 3500 } },
  ];
  const avg = stageAverages(records, plan);
  assert.equal(avg.byKey.cross.avgMs, 2500);
  assert.equal(avg.byKey.cross.avgMoves, 9);
  assert.equal(avg.byKey.cross.source, 'history');
  assert.equal(avg.byKey.eo.avgMs, 500, 'a skip counts as zero');
  assert.equal(avg.byKey.pair1.avgMs, 2000, 'legacy f2l phase split over four pairs');
  assert.equal(avg.byKey.cp.avgMs, 1750);
  const pbs = pbSplits(records, plan);
  assert.equal(pbs.cross, 2000);
  assert.equal(pbs.eo, 1000, 'skips are not PBs');
  assert.equal(pbs.pair1, null);
});

// Drive the reducer with plain live snapshots at controller-clock times.
function drive(steps) {
  let track = createTrack();
  for (const [t, snap] of steps) track = trackMilestones(track, snap, t);
  return track;
}
const solving = (count, progress, extra = {}) => ({ phase: 'solving', solveMoveCount: count, elapsedMs: null, inspectionMs: 8000, progress, ...extra });

test('milestones: stamps, move times and splits, with an EO skip', () => {
  const track = drive([
    [1000, { phase: 'inspecting' }],
    [5000, solving(1, { crossDone: false }, { elapsedMs: 0 })],
    [6000, solving(2, { crossDone: false })],
    [7000, solving(3, { crossDone: true, pairsSolved: 0 })],
    [8000, solving(4, { crossDone: true, pairsSolved: 1 })],
    [8000, solving(4, { crossDone: true, pairsSolved: 1 })],     // a coalesced double: same count, no new time
    [9500, solving(6, { crossDone: true, pairsSolved: 4, f2lDone: true, eoDone: true })],   // EO done on the F2L move
    [11000, solving(8, { crossDone: true, pairsSolved: 4, f2lDone: true, eoDone: true, coDone: true, ollDone: true })],
    [13000, { phase: 'done', solveMoveCount: 10, progress: { crossDone: true, pairsSolved: 4, f2lDone: true, eoDone: true, coDone: true, ollDone: true, solved: true }, record: { solveMs: 8000 } }],
  ]);
  assert.equal(track.solveStartAt, 5000);
  assert.deepEqual(track.moveTimes, [0, 1000, 2000, 3000, 4500, 4500, 6000, 6000, 8000, 8000]);
  assert.equal(track.stamps.solvedAt, 13000, 'end = start + the record’s raw time');
  const plan = buildStagePlan(normalizeSettings());
  const splits = splitsFromTrack(track, plan);
  const byKey = Object.fromEntries(splits.map(s => [s.key, s]));
  assert.equal(byKey.cross.ms, 2000);
  assert.equal(byKey.pair1.ms, 1000);
  assert.equal(byKey.pair2.ms, 1500);
  assert.equal(byKey.pair2.moves, 2);
  assert.equal(byKey.pair3.skipped, true, 'pairs 3 and 4 came with the move that solved pair 2');
  assert.equal(byKey.pair4.skipped, true);
  assert.equal(byKey.pair4.ms, 0);
  assert.equal(byKey.eo.skipped, true);
  assert.equal(byKey.co.ms, 1500);
  assert.equal(byKey.co.moves, 2);
  assert.equal(byKey.cp.skipped, false, 'CP falls back to the solve end');
  assert.equal(byKey.ep.skipped, true);
  assert.equal(splits.reduce((sum, s) => sum + s.ms, 0), 8000, 'splits add up to the solve time');
});

test('milestones: a cross completed with pairs is an x-cross; the merged pairs are done at the same moment, not skips', () => {
  const plan = buildStagePlan(normalizeSettings());
  const track = drive([
    [5000, solving(1, { crossDone: false }, { elapsedMs: 0 })],
    [7000, solving(5, { crossDone: true, pairsSolved: 2 })],    // the cross and two pairs at once
    [9000, solving(9, { crossDone: true, pairsSolved: 3 })],
  ]);
  assert.equal(track.stamps.xPairs, 2);
  const sp = stageProgress(track, plan);
  assert.deepEqual(sp.stages.slice(0, 4).map(s => [s.key, s.done, s.merged, s.skipped]), [['cross', true, false, false], ['pair1', true, true, false], ['pair2', true, true, false], ['pair3', true, false, false]]);
  assert.equal(sp.currentIndex, 4, 'the timeline continues at pair 4');
  assert.equal(sp.stages[1].endAt, sp.stages[0].endAt, 'merged pairs end with the cross');
  const splits = splitsFromTrack(track, plan);
  assert.ok(splits.slice(1, 3).every(isMergedSplit), 'stored as zero-time, zero-move, not skipped');
  assert.ok(!isMergedSplit(splits[3]));
  // Merged pairs do not drag the pair averages or pbs down to zero.
  const records = [{ solveMs: 16000, solved: true, splits }, { solveMs: 16000, solved: true, splits: [{ key: 'pair1', ms: 2000, moves: 6 }] }];
  assert.equal(stageAverages(records, plan).byKey.pair1.avgMs, 2000);
  assert.equal(pbSplits(records, plan).pair1, 2000);
  // A plain cross with pairs solved later is not one.
  const plain = drive([[5000, solving(1, { crossDone: false }, { elapsedMs: 0 })], [7000, solving(5, { crossDone: true, pairsSolved: 0 })], [9000, solving(9, { crossDone: true, pairsSolved: 1 })]]);
  assert.equal(plain.stamps.xPairs, 0);
  assert.ok(stageProgress(plain, plan).stages.every(s => !s.merged));
});

test('milestones: current stage while solving, reset on the next attempt, autostart origin', () => {
  const plan = buildStagePlan(normalizeSettings());
  let track = drive([[2000, solving(3, { crossDone: true, pairsSolved: 0 }, { elapsedMs: 1500 })]]);
  assert.equal(track.solveStartAt, 500, 'autostart: the clock started before the first emit');
  const sp = stageProgress(track, plan);
  assert.equal(sp.currentIndex, 1);
  assert.equal(sp.stages[1].startAt, 2000);
  assert.equal(sp.stages[0].done, true);
  const same = trackMilestones(track, solving(3, { crossDone: true, pairsSolved: 0 }), 2100);
  assert.equal(same, track, 'nothing new: same object');
  track = trackMilestones(track, { phase: 'inspecting' }, 9000);
  assert.equal(track.active, false);
  assert.equal(stageProgress(track, plan).currentIndex, 0);
});

test('TPS series, pauses, skip marks and bands', () => {
  const times = [200, 400, 600, 800, 1000, 2400, 2600];
  const stages = [{ key: 'cross', label: 'cross', startAt: 0, endAt: 1000, skipped: false }, { key: 'eo', label: 'eo', startAt: 1000, endAt: 1000, skipped: true }, { key: 'co', label: 'co', startAt: 1000, endAt: 2600, skipped: false }];
  const s = tpsSeries(times, { durationMs: 2600, stages, averages: { byKey: { cross: { avgMs: 1000, avgMoves: 4 } } }, avgFlat: 3 });
  assert.equal(s.durationMs, 2600);
  assert.equal(s.points[0].tMs, 0);
  assert.equal(s.points[s.points.length - 1].tMs, 2600);
  assert.ok(s.points.find(p => p.tMs === 600).tps > 3);
  assert.deepEqual(s.marks.map(m => m.kind), ['skip', 'pause']);
  assert.equal(s.marks[1].label, '1.4 s pause');
  assert.deepEqual(s.bands.map(b => [b.key, b.fromMs, b.toMs]), [['cross', 0, 1000], ['eo', 1000, 1000], ['co', 1000, 2600]]);
  assert.deepEqual(s.avg, [{ fromMs: 0, toMs: 1000, tps: 4 }]);
  assert.equal(s.maxTps % 2, 0);
  assert.equal(tpsSeries([]).points.length, 0);
});

test('split rows, donut arcs and the history sparkline', () => {
  const plan = buildStagePlan(normalizeSettings());
  const stages = [{ key: 'cross', ms: 2000, moves: 8 }, { key: 'eo', ms: 0, moves: 0, skipped: true }, { key: 'co', ms: 1000, moves: 5 }];
  const averages = { byKey: { cross: { avgMs: 2500 }, eo: { avgMs: 900 }, co: { avgMs: 800 } } };
  const rows = splitRows(stages, plan, averages);
  assert.deepEqual(rows.map(r => [r.text, r.deltaText, r.tone]), [['2.00', '-0.50', 'faster'], ['skip', '', 'none'], ['1.00', '+0.20', 'slower']]);
  assert.equal(rows[0].avgRatio, 1);
  assert.equal(rows[0].ratio, 0.8);
  const pb = splitRows(stages, plan, averages, { compare: 'pb', pbs: { cross: 1900 } });
  assert.equal(pb[0].deltaText, '+0.10');
  assert.equal(splitRows(stages, plan, averages, { compare: 'raw' })[0].deltaText, '');
  const arcs = donutArcs(stages, plan, averages);
  assert.ok(Math.abs(arcs.reduce((s, a) => s + a.fraction, 0) - 1) < 1e-9);
  assert.deepEqual(arcs.map(a => a.tone), ['faster', 'skip', 'slower']);
  const records = [{ at: 1, solveMs: 15000 }, { at: 2, solveMs: 12000, penalty: '+2' }, { at: 3, solveMs: 11000, penalty: 'DNF' }, { at: 4, solveMs: 12500 }, { at: 5, solveMs: 16000 }];
  const spark = sparkline(records, { currentAt: 5 });
  assert.deepEqual(spark.points.map(p => p.kind), ['normal', 'plus2', 'dnf', 'pb', 'current']);
  assert.equal(spark.points[2].ms, null);
  assert.equal(spark.min, 12500);
  assert.equal(spark.max, 16000);
});

test('formatting: times, deltas, results with penalties', () => {
  assert.equal(fmtTime(14070), '14.07');
  assert.equal(fmtTime(62340), '1:02.34');
  assert.equal(fmtTime(9999), '9.99', 'a running clock never rounds up');
  assert.equal(fmtTime(null), '—');
  assert.equal(fmtTime(Infinity), 'DNF');
  assert.equal(fmtSeconds(14070), '14.07s');
  assert.equal(fmtDelta(-330), '-0.33');
  assert.equal(fmtDelta(40), '+0.04');
  assert.equal(fmtDelta(2), '±0.00');
  assert.equal(deltaTone(-330), 'faster');
  assert.equal(deltaTone(10), 'even');
  assert.equal(deltaTone(null), 'none');
  assert.equal(fmtResult({ solveMs: 12970, penalty: '+2' }), '14.97+');
  assert.equal(fmtResult({ solveMs: 12970, penalty: '+2' }, 'long'), '12.97 +2');
  assert.equal(fmtResult({ solveMs: 13200, penalty: 'DNF' }), 'DNF(13.20)');
  assert.equal(fmtResult({ solveMs: 14070 }), '14.07');
  assert.equal(penaltyTag({ penalty: 'DNF' }), 'dnf');
});
