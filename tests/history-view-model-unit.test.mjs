import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryViewModel, historyPath, historyReviewHref, historyReviewPath, parseHistoryRoute, replayPath } from '../src/history/view-model.js';

const rec = (at, solveMs, extra = {}) => ({
  at, solveMs, penalty: null, focus: 'speed', source: 'smart', sessionId: 's1',
  scramble: 'R U', solveMoves: ['R', 'U'], moveCount: 2, splits: [{ key: 'cross', ms: solveMs, moves: 2 }],
  moveTimes: [100, 200], analysis: { marks: { cross: 0, solved: 1 } }, ...extra,
});

test('history route helpers round-trip timestamp and marker routes', () => {
  assert.deepEqual(parseHistoryRoute('#/history'), { kind: 'list', at: null, marker: null, path: '/history' });
  assert.deepEqual(parseHistoryRoute(`#${historyPath(123)}`), { kind: 'past', at: 123, marker: null, path: '/history/123' });
  assert.equal(parseHistoryRoute(`#${replayPath(123)}`).kind, 'replay');
  assert.equal(historyReviewPath(123, 'pause:pair4'), '/history/123/review/pause%3Apair4');
  assert.equal(historyReviewHref(123, 'pause:pair4'), '#/history/123/review/pause%3Apair4');
  assert.equal(historyReviewHref(123, null), '#/review/123');
  assert.deepEqual(parseHistoryRoute(`#${historyReviewPath(123, 'pause:pair4')}`), { kind: 'review', at: 123, marker: 'pause:pair4', path: '/history/123/review/pause%3Apair4' });
  assert.equal(parseHistoryRoute('#/history/nope').kind, 'not-found');
});

test('history model groups sessions and keeps focus/source metrics scoped', () => {
  const records = [
    rec(1000, 14_000), rec(2000, 13_000), rec(3000, 12_000, { penalty: '+2' }),
    rec(4000, 10_000, { focus: 'flow', sessionId: 's4' }),
    rec(5000, 9_000, { source: 'import', sessionId: 's4' }),
  ];
  const vm = buildHistoryViewModel({ records, filters: { focus: 'speed', source: 'smart' }, selectedAt: 3000, now: 50 });
  assert.equal(vm.screen, 'history');
  assert.equal(vm.summary.count, 3);
  assert.equal(vm.summary.pb, '13.00');
  assert.equal(vm.sessions.length, 1);
  assert.equal(vm.sessions[0].count, 3);
  assert.equal(vm.sessions[0].solves[0].at, 3000);
  assert.equal(vm.selected.move, 2, 'the list preview shows the completed solve');
  assert.equal(vm.selected.playing, false);
  assert.equal(vm.now, 50);
});

test('default filters and a direct past route retain context and stored penalties', () => {
  const records = [
    rec(1000, 14_000),
    rec(2000, 12_000, { penalty: '+2' }),
    rec(3000, 10_000, { penalty: 'DNF' }),
  ];
  const vm = buildHistoryViewModel({ records, route: { kind: 'past', at: 2000 } });
  assert.equal(vm.summary.count, 3);
  assert.equal(vm.summary.pb, '14.00');
  assert.equal(vm.selected.at, 2000);
  assert.equal(vm.screen, 'past-solve');
  assert.equal(vm.selected.result, '14.00+');
  assert.equal(vm.selected.penalty, '+2');
  assert.equal(vm.filters.focus, 'all');
  assert.equal(vm.filters.source, 'all');
});

test('stats-source preference scopes comparison metrics without hiding other history rows', () => {
  const records = [
    rec(1000, 12_000, { source: 'smart' }),
    rec(2000, 14_000, { source: 'manual', penalty: '+2' }),
    rec(3000, 9_000, { source: 'import' }),
  ];
  const vm = buildHistoryViewModel({ records, settings: { stats: { source: 'manual' } } });
  assert.equal(vm.summary.count, 3);
  assert.equal(vm.summary.pb, '16.00+');
  assert.equal(vm.filters.statsSource, 'manual');
});

test('legacy replay model reports missing timing and derives even-pace cursor time', () => {
  const record = rec(1000, 2400, { moveTimes: undefined, analysis: { marks: { cross: 0, solved: 1 }, skips: [], pseudo: [], pauses: [], cancels: [] } });
  const vm = buildHistoryViewModel({ records: [record], route: { kind: 'replay', at: 1000 }, move: 1 });
  assert.equal(vm.screen, 'replay');
  assert.equal(vm.selected.hasTiming, false);
  assert.equal(vm.selected.timingLabel, 'timing not recorded');
  assert.equal(vm.selected.elapsedMs, 1200);
  assert.deepEqual(vm.selected.stages.map(stage => [stage.key, stage.start, stage.end]), [['cross', 0, 1], ['ep', 1, 2]]);
});

test('partial legacy analysis is normalized to iterable marker collections for the shared result presenter', () => {
  const record = rec(1000, 2400, { analysis: { pauses: [{ i: 1, ms: 900, allow: 250, boundary: 'cross-f2l' }] } });
  const vm = buildHistoryViewModel({ records: [record], route: { kind: 'past', at: 1000 } });
  assert.deepEqual(vm.selected.analysis.skips, []);
  assert.deepEqual(vm.selected.analysis.pseudo, []);
  assert.deepEqual(vm.selected.analysis.cancels, []);
  assert.deepEqual(vm.selected.analysis.pairs, []);
  assert.equal(vm.selected.markers[0].id, 'pause-1');
});

test('recorded replay timing requires one finite stamp per move and clamps its cursor', () => {
  const record = rec(1000, 900, { moveTimes: [250, 900, 1100] });
  const vm = buildHistoryViewModel({ records: [record], route: { kind: 'replay', at: 1000 }, move: 20, speed: 2 });
  assert.equal(vm.selected.hasTiming, false);
  assert.equal(vm.selected.move, 2);
  assert.equal(vm.selected.speed, 2);
  assert.equal(vm.selected.elapsedMs, 900);
});

test('free-scramble turns remain replayable when no scramble string was stored', () => {
  const vm = buildHistoryViewModel({ records: [rec(1000, 900, { scramble: '', scrambleTurns: ['R', 'U'] })], route: { kind: 'replay', at: 1000 }, now: 0 });
  assert.equal(vm.selected.hasReplay, true);
  assert.equal(vm.selected.scramble, 'R U');
});
