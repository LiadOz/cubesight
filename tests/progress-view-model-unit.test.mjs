import test from 'node:test';
import assert from 'node:assert/strict';
import { readProgress } from '../src/progress/adapter.js';
import { buildProgressViewModel } from '../src/progress/view-model.js';
import { buildWeeklyReport, goalProgress, readGoal } from '../src/goals/adapter.js';
import { seedGoalProgressState } from './helpers/goal-progress-state.js';
import { listSessions } from '../src/store/sessions.js';

const DAY = 86_400_000;
const phases = (crossMs, f2lMs, ollMs = 2_000, pllMs = 1_500) => ({ crossMs, f2lMs, ollMs, pllMs });
const record = (at, sessionId, source, focus, splitPhases) => ({
  at, sessionId, source, focus, solved: true, solveMs: 14_000, phases: splitPhases,
});
const storage = { getItem: () => null };

test('progress split comparison uses the selected period, source, focus, and session cohort', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const rows = [
    record(now - 31 * DAY, 's1', 'smart', 'speed', phases(3_000, 5_000)),
    record(now - 2 * DAY, 's1', 'smart', 'speed', phases(2_800, 5_500)),
    record(now - 1 * DAY, 's2', 'smart', 'speed', phases(1_000, 1_000)),
    record(now - 1 * DAY, 's1', 'manual', 'speed', phases(1_000, 1_000)),
    record(now - 1 * DAY, 's1', 'smart', 'flow', phases(1_000, 1_000)),
  ];
  const result = readProgress(storage, { records: rows, algorithms: [], source: 'smart', focus: 'speed', session: 's1', days: '30', now });
  assert.equal(result.splits.length, 4);
  assert.equal(result.splits[0].ms, 2_800);
  assert.equal(result.splits[0].previousMs, 3_000);
  assert.equal(result.splits[0].deltaMs, -200);
  assert.equal(result.splits[1].deltaMs, 500);
  assert.equal(result.splits[0].samples, 1);
  assert.equal(result.splits[0].previousSamples, 1);
  assert.equal(result.comparison.available, true);
});

test('all-time and missing prior samples never invent split deltas', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const rows = [record(now - DAY, 's1', 'smart', 'speed', phases(2_800, 5_500))];
  const allTime = readProgress(storage, { records: rows, days: 'all', now });
  assert.equal(allTime.comparison.label, 'all time · no comparison period');
  assert.ok(allTime.splits.every(split => split.deltaMs === null));
  const recent = readProgress(storage, { records: rows, days: '30', now });
  assert.equal(recent.comparison.available, false);
  assert.ok(recent.splits.every(split => split.deltaMs === null));
});

test('adjacent period windows do not overlap and include their start boundaries once', () => {
  const now = Date.UTC(2026, 9, 2, 12), currentStart = now - 30 * DAY, previousStart = now - 60 * DAY;
  const rows = [
    record(previousStart, 's1', 'smart', 'speed', phases(3_000, 4_000)),
    record(currentStart - 1, 's1', 'smart', 'speed', phases(5_000, 4_000)),
    record(currentStart, 's1', 'smart', 'speed', phases(2_000, 4_000)),
    record(now, 's1', 'smart', 'speed', phases(4_000, 4_000)),
  ];
  const result = readProgress(storage, { records: rows, session: 's1', days: '30', now });
  assert.equal(result.splits[0].samples, 2);
  assert.equal(result.splits[0].previousSamples, 2);
  assert.equal(result.splits[0].ms, 3_000);
  assert.equal(result.splits[0].previousMs, 4_000);
  assert.equal(result.splits[0].deltaMs, -1_000);
});

test('the renderer model selects one primary Orbit for split averages or an ao12 goal', () => {
  const baseData = {
    splits: [
      { key: 'cross', label: 'cross', ms: 2_800, deltaMs: -200, samples: 4, previousSamples: 4, href: '#/drills/scout' },
      { key: 'F2L', label: 'F2L', ms: 5_500, deltaMs: 500, samples: 4, previousSamples: 4, href: '#/drills/f2l' },
    ],
    comparison: { available: true, label: 'previous 30 days' },
    stats: { ao12: 17_000, timedCount: 12 }, due: 2,
    drills: [{ id: 'corners', title: 'corner recognition', href: '#/drills/corners', rounds: 1, cases: 8, accuracy: .875, due: 2, medianMs: 700, trendMs: null, lifetime: null }],
  };
  const filters = { session: 'all', source: 'smart', focus: 'speed', days: '30' };
  const splitModel = buildProgressViewModel({ filters, data: baseData, weekly: { solves: 0, rounds: 0, cases: 0 }, selectedView: 'splits' });
  assert.equal(splitModel.state, 'split-progress');
  assert.equal(splitModel.orbit.segments.length, 2);
  assert.equal(splitModel.orbit.segments[0].state, 'good');
  assert.equal(splitModel.orbit.segments[0].delta, -.2);
  assert.equal(splitModel.orbit.segments[1].state, 'bad');
  assert.equal(splitModel.orbit.segments[0].href, '#/drills/scout');

  const goal = { targetSeconds: 15, baselineSeconds: 20 };
  const goalModel = buildProgressViewModel({ filters, data: baseData, goal, goalState: goalProgress(goal, 17), weekly: {}, selectedView: 'goal' });
  assert.equal(goalModel.state, 'goal-progress');
  assert.equal(goalModel.orbit.segments.length, 1);
  assert.equal(goalModel.orbit.segments[0].fill, .6);
  assert.match(goalModel.goal.caption, /baseline 20\.00 s/);

  const waitingModel = buildProgressViewModel({ filters, data: { ...baseData, stats: { ao12: null, timedCount: 6 } }, goal, goalState: goalProgress(goal, null), weekly: {}, selectedView: 'goal' });
  assert.equal(waitingModel.orbit.segments.length, 1);
  assert.equal(waitingModel.orbit.segments[0].value, 'waiting');
  assert.match(waitingModel.goal.message, /6 of 12 timed solves/);
});

test('approved progress chart series come from actual cohort samples and preserve missing comparisons', () => {
  const filters = { session: 'all', source: 'smart', focus: 'speed', days: '30' };
  const data = {
    stats: { ao12: 15_000, timedCount: 12 },
    trend: [{ ms: null }, { ms: 16_000 }, { ms: 15_000 }],
    solves: [{ solveMs: 18_000 }, { solveMs: 17_000 }, { solveMs: Infinity }],
    splits: [
      { key: 'cross', label: 'cross', ms: 2_500, previousMs: 2_700, deltaMs: -200 },
      { key: 'F2L', label: 'F2L', ms: 5_000, previousMs: null, deltaMs: null },
    ],
  };
  const model = buildProgressViewModel({ filters, data, weekly: {} });
  assert.deepEqual(model.charts.ao12, [16_000, 15_000]);
  assert.deepEqual(model.charts.recent, [18_000, 17_000]);
  assert.deepEqual(model.charts.splitCurrent, [2_500, 5_000]);
  assert.deepEqual(model.charts.splitPrevious, [2_700, null]);
  assert.deepEqual(model.charts.splitLabels, ['cross', 'F2L']);
});

test('F6 progress fixtures build strict-clone-safe F5 models for empty, waiting, progress, and reached states', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  const storageFactory = () => {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  };
  const clone = (value, path = 'viewModel') => {
    if (value === undefined) throw new TypeError(`${path} is undefined`);
    if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : { $number: value === Infinity ? 'Infinity' : value === -Infinity ? '-Infinity' : 'NaN' };
    if (Array.isArray(value)) return value.map((item, index) => clone(item, `${path}[${index}]`));
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${path} is not JSON-safe`);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item, `${path}.${key}`)]));
  };
  const filters = { session: 'all', source: 'smart', focus: 'speed', days: 'all' };
  for (const state of ['unset', 'insufficient', 'progress', 'reached']) {
    const storage = storageFactory();
    const fixture = seedGoalProgressState(storage, { state, now });
    const records = fixture.records.map(row => ({ ...row, sessionId: 's-f5' }));
    const data = readProgress(storage, { ...filters, records, now });
    const goal = readGoal(storage);
    const goalState = goalProgress(goal, Number.isFinite(data.stats.ao12) ? data.stats.ao12 / 1000 : null);
    const weekly = buildWeeklyReport({ solves: records, rounds: JSON.parse(storage.getItem('cubesight-rounds-v1')) }, { source: 'smart', focus: 'speed', now });
    const model = buildProgressViewModel({ filters, data, goal, goalState, weekly, sessions: listSessions(records).map(row => ({ ...row, label: 'fixture session' })), selectedView: goal ? 'goal' : 'splits' });
    const snapshot = clone(model);
    assert.equal(snapshot.orbit.segments.length, goal ? 1 : 0);
    assert.equal(snapshot.goal.percent, state === 'progress' ? 60 : state === 'reached' ? 100 : null);
    assert.equal(model.goal.mode, state === 'progress' || state === 'reached' ? 'progress' : 'waiting');
  }

  const storage = storageFactory();
  const dnfRecords = Array.from({ length: 12 }, (_, index) => ({ at: now - (12 - index) * 60_000, solveMs: 17_000, penalty: index < 2 ? 'DNF' : null, solved: true, source: 'smart', focus: 'speed', sessionId: 's-dnf' }));
  const dnfData = readProgress(storage, { ...filters, records: dnfRecords, now });
  const goal = { metric: 'ao12', targetSeconds: 15, baselineSeconds: 20, createdAt: now };
  const model = buildProgressViewModel({ filters, data: dnfData, goal, goalState: goalProgress(goal, null), weekly: buildWeeklyReport({ solves: dnfRecords }, { now }), selectedView: 'goal' });
  const snapshot = clone(model);
  assert.equal(model.goal.currentSeconds, Infinity);
  assert.equal(snapshot.goal.currentSeconds.$number, 'Infinity');
  assert.match(snapshot.goal.message, /ao12 is a DNF/);
});
