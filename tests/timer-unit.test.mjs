import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimerMachine, truncateMs, normalizeHoldMs } from '../src/timer/machine.js';
import { buildManualRecord, statsRow } from '../src/timer/record.js';
import { DEFAULT_INSPECTION, normalizeInspection } from '../src/solve-live.js';
import { createHistoryStore } from '../src/store/history.js';
import { createMemoryBackend } from '../src/store/memory-backend.js';
import { analysisInputFromRecord } from '../src/analysis/record.js';
import { resultMs } from '../src/solve-metrics.js';
import { cleanRecord } from '../src/solve-store.js';
import { inStatsSource } from '../src/store/focus.js';

const rig = (options = {}) => {
  let t = 1000;
  const finished = [];
  const machine = createTimerMachine({ now: () => t, onFinish: r => finished.push(r), ...options });
  return { machine, finished, advance: ms => { t += ms; }, at: () => t };
};
const press = (r, holdMs) => { r.machine.down(); r.advance(holdMs); r.machine.up(); };
const insp = patch => normalizeInspection(patch, DEFAULT_INSPECTION);

test('hold threshold: released early does nothing, ready after 300 ms', () => {
  const r = rig();
  r.machine.down();
  assert.equal(r.machine.snapshot().hold, 'holding');
  r.advance(299);
  assert.equal(r.machine.snapshot().hold, 'holding');
  r.advance(1);
  assert.equal(r.machine.snapshot().hold, 'ready');
  r.machine.up();
  assert.equal(r.machine.snapshot().phase, 'inspecting');

  const early = rig();
  press(early, 120);
  assert.equal(early.machine.snapshot().phase, 'idle');
  assert.equal(early.machine.snapshot().hold, null);
});

test('hold to start is configurable: 0, 300, 550', () => {
  const zero = rig({ holdMs: 0 });
  press(zero, 0);
  assert.equal(zero.machine.snapshot().phase, 'inspecting');
  const long = rig({ holdMs: 550 });
  press(long, 549);
  assert.equal(long.machine.snapshot().phase, 'idle');
  press(long, 550);
  assert.equal(long.machine.snapshot().phase, 'inspecting');
  assert.equal(normalizeHoldMs(123), 300);
  assert.equal(normalizeHoldMs('550'), 550);
});

test('input event timestamps keep a delayed release from extending a short hold', () => {
  const quickTap = rig({ holdMs: 550 });
  quickTap.machine.down(1000);
  quickTap.advance(800); // the event loop is busy before the release handler runs
  quickTap.machine.up(1080); // the actual input edges were only 80 ms apart
  assert.equal(quickTap.machine.snapshot().phase, 'idle');

  const held = rig({ holdMs: 550 });
  held.machine.down(1000);
  held.advance(800);
  held.machine.up(1600); // the physical hold lasted 600 ms, despite late delivery
  assert.equal(held.machine.snapshot().phase, 'inspecting');

  const delayedStop = rig({ holdMs: 0, inspection: insp({ mode: 'off' }) });
  delayedStop.machine.down(1000);
  delayedStop.machine.up(1000);
  delayedStop.advance(900);
  delayedStop.machine.down(1200); // the stop event was delivered 700 ms late
  assert.equal(delayedStop.finished[0].solveMs, 200);
});

test('inspection then solve: hold and release starts the clock, any down stops it', () => {
  const r = rig();
  press(r, 300);                      // start inspection
  r.advance(6000);
  assert.equal(r.machine.snapshot().inspectionElapsedMs, 6000);
  press(r, 300);                      // start the solve at 6.3 s of inspection
  let snap = r.machine.snapshot();
  assert.equal(snap.phase, 'running');
  r.advance(12_345);
  assert.equal(r.machine.snapshot().elapsedMs, 12_340);   // the running clock is truncated too
  r.machine.down();                   // stop
  snap = r.machine.snapshot();
  assert.equal(snap.phase, 'done');
  assert.equal(r.finished.length, 1);
  assert.deepEqual(r.finished[0], { solveMs: 12_340, penalty: null, inspectionMs: 6300, inspectionMode: 'wca' });
});

test('the release after a stop does not start the next attempt', () => {
  const r = rig({ holdMs: 0 });
  press(r, 0); press(r, 0);
  r.advance(5000);
  r.machine.down();                   // stop
  r.advance(80);
  r.machine.up();                     // swallowed
  assert.equal(r.machine.snapshot().phase, 'done');
  assert.equal(r.machine.snapshot().hold, null);
  press(r, 300);                      // a fresh hold starts the next inspection
  assert.equal(r.machine.snapshot().phase, 'inspecting');
});

test('times are truncated to hundredths, never rounded', () => {
  assert.equal(truncateMs(9999), 9990);
  assert.equal(truncateMs(14_009), 14_000);
  assert.equal(truncateMs(14_010), 14_010);
  const r = rig({ holdMs: 0, inspection: insp({ mode: 'off' }) });
  press(r, 0);
  r.advance(7_999);
  r.machine.down();
  assert.equal(r.finished[0].solveMs, 7_990);
});

test('inspection off: release starts the solve directly, no inspection info', () => {
  const r = rig({ inspection: insp({ mode: 'off' }) });
  press(r, 300);
  assert.equal(r.machine.snapshot().phase, 'running');
  r.advance(9000);
  r.machine.down();
  assert.deepEqual(r.finished[0], { solveMs: 9000, penalty: null, inspectionMs: null, inspectionMode: 'off' });
});

const startAfterInspection = (inspection, inspectMs) => {
  const r = rig({ holdMs: 0, inspection });
  press(r, 0);
  r.advance(inspectMs);
  press(r, 0);
  r.advance(10_000);
  r.machine.down();
  return r;
};

test('wca overtime: +2 up to 2 s over, DNF beyond, none at the limit', () => {
  assert.equal(startAfterInspection(insp({}), 15_000).finished[0].penalty, null);
  assert.equal(startAfterInspection(insp({}), 15_001).finished[0].penalty, '+2');
  assert.equal(startAfterInspection(insp({}), 16_999).finished[0].penalty, '+2');
  assert.equal(startAfterInspection(insp({}), 17_001).finished[0].penalty, 'DNF');
  assert.equal(startAfterInspection(insp({ mode: 'custom', seconds: 10 }), 10_500).finished[0].penalty, '+2');
});

test('count, grace and unlimited overtime follow solve-live inspectionPenalty', () => {
  assert.equal(startAfterInspection(insp({ overtime: 'count' }), 40_000).finished[0].penalty, null);
  const grace = insp({ overtime: 'grace', graceSeconds: 2, gracePenalty: 'plus2' });
  assert.equal(startAfterInspection(grace, 16_500).finished[0].penalty, null);
  assert.equal(startAfterInspection(grace, 17_500).finished[0].penalty, '+2');
  assert.equal(startAfterInspection(insp({ overtime: 'grace', gracePenalty: 'dnf' }), 18_000).finished[0].penalty, 'DNF');
  assert.equal(startAfterInspection(insp({ mode: 'unlimited' }), 120_000).finished[0].penalty, null);
});

test('autostart: the solve clock starts by itself at the limit, no penalty', () => {
  const r = rig({ holdMs: 0, inspection: insp({ overtime: 'autostart' }) });
  press(r, 0);
  r.advance(14_999);
  assert.equal(r.machine.snapshot().phase, 'inspecting');
  r.advance(501);                     // 15.5 s: the clock has been running for 0.5 s
  const snap = r.machine.snapshot();
  assert.equal(snap.phase, 'running');
  assert.equal(snap.elapsedMs, 500);
  r.advance(4500);
  r.machine.down();
  assert.deepEqual(r.finished[0], { solveMs: 5000, penalty: null, inspectionMs: 15_000, inspectionMode: 'wca' });
});

test('a hold that was in progress when autostart fires does not double start', () => {
  const r = rig({ holdMs: 300, inspection: insp({ overtime: 'autostart' }) });
  press(r, 300);
  r.advance(14_900);
  r.machine.down();                   // finger down 100 ms before the limit
  r.advance(200);
  assert.equal(r.machine.snapshot().phase, 'running');
  r.machine.up();                     // the release must not stop or restart anything
  assert.equal(r.machine.snapshot().phase, 'running');
  assert.equal(r.finished.length, 0);
});

test('cancel abandons an attempt with no result; abortHold only drops the hold', () => {
  const r = rig();
  press(r, 300);
  r.machine.cancel();
  assert.equal(r.machine.snapshot().phase, 'idle');
  press(r, 300);
  r.machine.down();
  r.machine.abortHold();
  assert.equal(r.machine.snapshot().phase, 'inspecting');
  assert.equal(r.machine.snapshot().hold, null);
  assert.equal(r.finished.length, 0);
});

test('releasing early from done keeps the result on screen', () => {
  const r = rig({ holdMs: 300, inspection: insp({ mode: 'off' }) });
  press(r, 300);
  r.advance(4000);
  r.machine.down();
  r.machine.up();
  r.machine.down();
  r.advance(100);
  r.machine.up();
  assert.equal(r.machine.snapshot().phase, 'done');
  assert.equal(r.machine.snapshot().result.solveMs, 4000);
});

test('the saved record: manual source, scramble, time, penalty, inspection, no moves', () => {
  const record = buildManualRecord({ solveMs: 12_340, penalty: '+2', inspectionMs: 15_400, inspectionMode: 'wca' }, { at: 1_700_000_000_000, scramble: "R U R' U'", focus: 'flow' });
  assert.deepEqual(record, {
    at: 1_700_000_000_000, source: 'manual', focus: 'flow', scramble: "R U R' U'", free: false,
    solveMs: 12_340, penalty: '+2', inspectionMs: 15_400, inspectionMode: 'wca',
    solved: true, moveCount: 0, solveMoves: [], tps: null, config: { inspectionMode: 'wca' },
  });
});

test('history keeps source, assigns the session, and the Brain analysis skips it', async () => {
  const store = createHistoryStore({ backend: createMemoryBackend() });
  await store.load();
  const saved = store.append(buildManualRecord({ solveMs: 13_200, penalty: null, inspectionMs: 9000, inspectionMode: 'wca' }, { at: 5_000_000, scramble: "R U R' U'", focus: 'speed' }));
  assert.equal(saved.source, 'manual');
  assert.equal(saved.sessionId, 's5000000');
  assert.equal(saved.focus, 'speed');
  assert.equal(saved.moveCount, 0);
  assert.equal(analysisInputFromRecord(saved).skip, 'no-moves');
  // a second solve within the gap joins the session; a smart-cube record has no `source`
  const next = store.append(buildManualRecord({ solveMs: 12_000, penalty: null, inspectionMs: null, inspectionMode: 'off' }, { at: 5_060_000, scramble: '', focus: 'speed' }));
  assert.equal(next.sessionId, saved.sessionId);
  const cube = store.append({ at: 5_120_000, solveMs: 15_000, moveCount: 50, solveMoves: [], solved: true });
  assert.equal('source' in cube, false);
  // penalty edit and delete work on manual records as on any other
  assert.equal(store.setPenalty(saved.at, '+2').penalty, '+2');
  assert.equal(resultMs(store.records[0]), 15_200);
  assert.equal(store.setPenalty(saved.at, 'DNF').penalty, 'DNF');
  assert.equal(store.remove(next.at).at, next.at);
  await store.flush();
  const reloaded = createHistoryStore({ backend: createMemoryBackend({ records: store.records, meta: { schema: 2 } }) });
  await reloaded.load();
  assert.equal(reloaded.records[0].source, 'manual');
});

test('stats row is within the focus and shows only the averages that exist', () => {
  const mk = (i, ms, focus = 'speed', penalty = null) => ({ at: i * 1000, solveMs: ms, penalty, focus, solved: true });
  const speed = [1, 2, 3, 4, 5].map(i => mk(i, 10_000 + i * 100));
  const row = statsRow([...speed, mk(6, 1000, 'flow')], 'speed', 'all');
  assert.equal(row.count, 5);
  assert.deepEqual(row.cells.map(c => c.key), ['ao5', 'mo3', 'pb']);
  assert.equal(row.cells.find(c => c.key === 'pb').text, '10.10');
  assert.equal(row.cells.find(c => c.key === 'ao5').text, '10.30');
  assert.deepEqual(statsRow([], 'speed', 'all'), { count: 0, cells: [] });
  const dnf = statsRow([...speed.slice(0, 4), mk(5, 9000, 'speed', 'DNF')], 'speed', 'all');
  assert.equal(dnf.cells.find(c => c.key === 'pb').text, '10.10');
});

test('timer stats separate manual solves by default and mix sources only for all in the current session', () => {
  const records = [
    ...Array.from({ length: 5 }, (_, i) => ({ at: i + 1, solveMs: 10_000 + i * 100, focus: 'speed', sessionId: 's1' })),
    ...Array.from({ length: 2 }, (_, i) => ({ at: i + 6, solveMs: 9_000 + i * 100, focus: 'speed', source: 'manual', sessionId: 's1' })),
  ];
  assert.equal(statsRow(records, 'speed').count, 2);
  assert.equal(statsRow(records, 'speed', 'all').count, 7);
  assert.equal(statsRow(records, 'flow').count, 0);
});

test('history retains import and manual source labels while legacy smart solves stay unlabeled', () => {
  const record = source => cleanRecord({ at: 1, source, solved: true, solveMs: 12_000 });
  assert.equal(record('manual').source, 'manual');
  assert.equal(record('import').source, 'import');
  assert.equal('source' in record('smart'), false);
});

test('smart stats exclude manual and imported records unless all is selected', () => {
  const records = [{ at: 1 }, { at: 2, source: 'manual' }, { at: 3, source: 'import' }];
  assert.deepEqual(inStatsSource(records).map(record => record.at), [1]);
  assert.deepEqual(inStatsSource(records, 'manual').map(record => record.at), [2]);
  assert.deepEqual(inStatsSource(records, 'all'), records);
});
