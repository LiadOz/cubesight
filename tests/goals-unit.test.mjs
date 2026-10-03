import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, clearGoal, goalProgress, readGoal, saveGoal } from '../src/goals/adapter.js';
import { createVoiceCallouts } from '../src/goals/voice-callouts.js';
import { shareCardSvg, solveOrbitOptions } from '../src/goals/share-card.js';
import { DEFAULT_SETTINGS } from '../src/brain/settings.js';
import { seedGoalProgressState, clearGoalProgressState } from './helpers/goal-progress-state.js';

function storageMock() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}

test('goal persistence validates the target and measures progress from its baseline', () => {
  const storage = storageMock();
  assert.equal(readGoal(storage), null);
  const saved = saveGoal(storage, { targetSeconds: '15', baselineSeconds: 18, createdAt: 1 });
  assert.deepEqual(readGoal(storage), saved);
  assert.equal(goalProgress(saved, 16).percent, 66.66666666666666);
  assert.equal(goalProgress(saved, 16).mode, 'progress');
  assert.equal(goalProgress(saved, 14).reached, true);
  assert.equal(goalProgress({ targetSeconds: 15, baselineSeconds: null }, 20).percent, 75);
  assert.equal(goalProgress({ targetSeconds: 15, baselineSeconds: null }, 20).mode, 'proximity');
  assert.equal(goalProgress(saved, null).percent, null);
  assert.throws(() => saveGoal(storage, { targetSeconds: 0 }), /positive/);
  clearGoal(storage);
  assert.equal(readGoal(storage), null);
});

test('goal progress fixtures cover unset, insufficient, in-progress, and reached states', () => {
  const storage = storageMock(), now = Date.UTC(2026, 9, 2, 12);
  for (const [state, count, current, percent] of [
    ['unset', 12, 17, null], ['insufficient', 6, null, null], ['progress', 12, 17, 60], ['reached', 12, 14, 100],
  ]) {
    const fixture = seedGoalProgressState(storage, { state, now });
    assert.equal(fixture.records.length, count);
    assert.equal(readGoal(storage)?.targetSeconds ?? null, state === 'unset' ? null : 15);
    assert.equal(goalProgress(readGoal(storage), current).percent, percent);
  }
  clearGoalProgressState(storage);
  assert.equal(readGoal(storage), null);
});

test('weekly report uses the local Monday boundary and returns partial metrics honestly', () => {
  const monday = new Date(2026, 8, 28, 12).getTime();
  const before = new Date(2026, 8, 28, 0).getTime() - 1;
  const report = buildWeeklyReport({
    solves: [{ at: before, solveMs: 10000 }, { at: monday, solveMs: 12000, splits: [{ key: 'cross', ms: 3000 }] }],
    rounds: [{ at: monday, n: 5, correct: 4 }],
  }, { now: monday });
  assert.equal(report.solves, 1);
  assert.equal(report.rounds, 1);
  assert.equal(report.cases, 5);
  assert.equal(report.correct, 4);
  assert.equal(report.ao12Ms, null);
  assert.equal(report.improvedMost, null);
  assert.equal(report.start, new Date(2026, 8, 28, 0).getTime());
});

test('weekly report ends at the next local Monday across a daylight-saving boundary', () => {
  const previousTz = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const sunday = new Date(2026, 2, 8, 12).getTime();
    const report = buildWeeklyReport({}, { now: sunday });
    assert.equal(report.start, new Date(2026, 2, 2, 0).getTime());
    assert.equal(report.end, new Date(2026, 2, 9, 0).getTime());
    assert.equal(report.end - report.start, 167 * 60 * 60 * 1000);
  } finally {
    if (previousTz == null) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
});

test('weekly ao12 applies official +2 and DNF rules within the selected source and focus', () => {
  const monday = new Date(2026, 8, 28, 12).getTime();
  const solves = [
    ...Array.from({ length: 12 }, (_, index) => ({ at: monday + index, solveMs: 10_000, penalty: '+2', source: 'smart', focus: 'speed' })),
    ...Array.from({ length: 12 }, (_, index) => ({ at: monday + index, solveMs: 20_000, source: 'manual', focus: 'speed' })),
    ...Array.from({ length: 12 }, (_, index) => ({ at: monday + index, solveMs: 30_000, source: 'smart', focus: 'flow' })),
  ];
  const report = buildWeeklyReport({ solves }, { now: monday + 20, source: 'smart', focus: 'speed' });
  assert.equal(report.solves, 12);
  assert.equal(report.ao12Ms, 12_000);
  solves[0].penalty = 'DNF'; solves[1].penalty = 'DNF';
  const dnfReport = buildWeeklyReport({ solves }, { now: monday + 20, source: 'smart', focus: 'speed' });
  assert.equal(dnfReport.ao12Ms, Infinity);
  assert.equal(DEFAULT_SETTINGS.voice, false);
});

test('voice callouts speak only enabled 8 s and 12 s transitions', () => {
  const spoken = [];
  class MockUtterance { constructor(text) { this.text = text; } }
  const speech = { cancelCount: 0, cancel() { this.cancelCount++; }, getVoices: () => [{ localService: true, lang: 'en-US' }], speak(value) { spoken.push(value.text); } };
  const voice = createVoiceCallouts({ speech, Utterance: MockUtterance });
  assert.equal(voice.status(), 'offline voice ready.');
  assert.equal(voice.update({ callout: 8, enabled: false, calloutsEnabled: true }), false);
  assert.equal(voice.update({ callout: 8, enabled: true, calloutsEnabled: true }), true);
  assert.equal(voice.update({ callout: 8, enabled: true, calloutsEnabled: true }), false);
  assert.equal(voice.update({ callout: 12, enabled: true, calloutsEnabled: true }), true);
  voice.update({ callout: null, enabled: true, calloutsEnabled: true });
  assert.deepEqual(spoken, ['8 seconds', '12 seconds']);
  assert.equal(speech.cancelCount, 3);
  const remoteOnly = createVoiceCallouts({ speech: { ...speech, getVoices: () => [{ localService: false }] }, Utterance: MockUtterance });
  assert.equal(remoteOnly.status(), 'no offline voice installed; callouts stay silent.');
  assert.equal(remoteOnly.update({ callout: 8, enabled: true, calloutsEnabled: true }), false);
});

test('share card embeds the shared Orbit SVG and displays the official +2 result', () => {
  const solve = { at: 0, solveMs: 14000, penalty: '+2', splits: [{ key: 'cross', label: '<cross>', ms: 3000 }, { key: 'F2L', ms: 11000 }] };
  const options = solveOrbitOptions(solve);
  assert.equal(options.segments.length, 2);
  assert.equal(options.segments[0].weight, 3000);
  const svg = shareCardSvg(solve, '<path class="orbit__segment-fill"/>');
  assert.match(svg, /<svg[^>]*width="1200"/);
  assert.match(svg, /16\.00/);
  assert.match(svg, /&lt;cross&gt; 3\.00 s/);
  assert.match(svg, /orbit__segment-fill/);
  assert.match(svg, /CubeSight/);
});
