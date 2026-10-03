import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRecord } from '../src/solve-store.js';
import { cleanAnalysis } from '../src/store/analysis-field.js';
import { analysisInputFromRecord } from '../src/analysis/record.js';
import { createAnalysisClient } from '../src/analysis/client.js';
import { ENGINE_VERSION } from '../src/analysis/segment.js';
import { SUMMARY_VERSION } from '../src/analysis/summary.js';
import { createAnalysisHandler } from '../src/analysis/index.js';
import { cachedSolver } from '../src/analysis/wasm-solver.js';
import { loadNodeSolver } from '../src/analysis/node-solver.js';
import { buildMarkers } from '../src/brain/review/markers.js';
import { GOLD } from './analysis-golden.mjs';
import { replayRecord, timesFor, analysed, PLAN, FACE_COLORS } from './helpers/review-fixtures.mjs';

const solverPromise = loadNodeSolver();

test('the stored summary is small, survives the store whitelist unchanged, and rejects junk', async () => {
  const base = await replayRecord();
  const record = await analysed({ ...base, moveTimes: timesFor(base.solveMoves.length, { pauses: { 20: 1800 } }) });
  const size = JSON.stringify(record.analysis).length;
  assert.ok(size < 6000, `summary is ${size} bytes`);
  assert.deepEqual(cleanAnalysis(record.analysis), record.analysis, 'idempotent');
  assert.deepEqual(cleanRecord(JSON.parse(JSON.stringify(record))).analysis, record.analysis, 'survives a JSON round trip through cleanRecord');
  const withCases = cleanRecord({ ...record, ollCase: record.analysis.ollCase?.id ?? null, pllCase: record.analysis.pllCase?.id ?? null });
  assert.equal(withCases.ollCase, record.analysis.ollCase?.id ?? null, 'the canonical OLL case index survives storage');
  assert.equal(withCases.pllCase, record.analysis.pllCase?.id ?? null, 'the canonical PLL case index survives storage');
  assert.equal(record.rotationMarks.length, base.rotations);
  assert.deepEqual(Object.keys(record.rotationMarks[0]).sort(), ['from', 'idx', 'tMs', 'to']);
  assert.equal(cleanAnalysis({ v: 4 }), null);
  assert.equal(cleanAnalysis({ v: 1, pairs: [] }).v, 1, 'older stored summaries remain readable');
  const partial = cleanAnalysis({ v: 2, engine: ENGINE_VERSION, pairs: [{ n: 1, from: 0, to: 1, yours: 'R', pendingUpgrade: true }] });
  assert.equal(partial.pairs[0].pendingUpgrade, true, 'a persisted first pass keeps its resumable status');
  assert.equal(cleanAnalysis('x'), null);
  const hostile = cleanAnalysis({ ...record.analysis, cross: { ...record.analysis.cross, best: 'rm -rf', losses: [{ i: 1, loss: 9 }] }, pairs: [{ n: 1, from: 0, to: 1, yours: '<b>', better: { moves: 'R <script>', slot: 'FR' } }] });
  assert.equal(hostile.cross.best, '');
  assert.deepEqual(hostile.cross.losses, []);
  assert.equal(hostile.pairs[0].better, null);
});

test('records that cannot be analysed say why', () => {
  const ok = { scramble: "R U", solveMoves: ['R'], moveCount: 1, solved: true, crossFace: 'D', moveTimes: [100] };
  assert.deepEqual(analysisInputFromRecord(ok).input, { scramble: 'R U', moves: ['R'], moveTimes: [100], crossFace: 'D' });
  assert.ok(analysisInputFromRecord({ ...ok, solved: false }).input, 'partial move history can capture reached cases');
  assert.ok(analysisInputFromRecord({ ...ok, penalty: 'DNF' }).input, 'a DNF can still have reached cases');
  assert.equal(analysisInputFromRecord({ ...ok, scramble: '' }).skip, 'no-scramble');
  assert.equal(analysisInputFromRecord({ ...ok, solveMoves: [], moveCount: 0 }).skip, 'no-moves');
  assert.equal(analysisInputFromRecord({ ...ok, solveMoves: Array(250).fill('R'), moveCount: 250 }).input.moves.length, 250, 'long records are analysed whole');
  assert.equal(analysisInputFromRecord({ ...ok, moveTimes: [1, 2] }).input.moveTimes, undefined, 'times of another length are ignored');
});

test('a pair that took longer than the planner finds gets a better-pair marker (pair 1)', async () => {
  const g = GOLD.normal;
  const all = g.moves.split(' ');
  const cross = all.slice(0, 8);
  // "U U'" is a detour that changes nothing: the pair then takes 5 moves where 3 do.
  const moves = [...cross, 'U', "U'", 'R', 'U', "R'"];
  const record = await analysed({
    at: 5, scramble: g.scramble, solveMoves: moves, moveCount: moves.length, solved: true, crossFace: 'D', tps: 4, rotations: 0,
    moveTimes: timesFor(moves.length),
    splits: [{ key: 'cross', ms: 2000, moves: 8 }, { key: 'pair1', ms: 1400, moves: 5 }],
  });
  const pair = record.analysis.pairs.find(p => p.n === 1);
  assert.equal(pair.yours, "U U' R U R'");
  assert.equal(pair.better.moves, "R U R'");
  assert.equal(pair.chosenSlot, 'FR');
  assert.deepEqual(pair.chosenSlots, ['FR']);
  assert.equal(pair.chosenShortest, 3);
  assert.ok(pair.bestSlot);
  assert.equal(pair.shortest, 3);
  const rows = [{ key: 'cross', moves: 8, ms: 2000, skipped: false, merged: false }, { key: 'pair1', moves: 5, ms: 1400, skipped: false, merged: false }];
  const { markers } = buildMarkers({ record, stages: rows, plan: PLAN, faceColors: FACE_COLORS });
  const better = markers.find(m => m.kind === 'better-pair');
  assert.ok(better);
  assert.equal(better.stage, 'pair1');
  assert.equal(better.at, 8, 'the cube shows the position where pair 1 starts');
  assert.deepEqual(better.better.moves, ['R', 'U', "R'"]);
  assert.equal(better.better.yours.length, 5);
  assert.match(better.note, /^Pair 1 took 5 moves\. The FR slot was 3 away: R U R′\./);
  assert.equal(better.trainer, 'f2l');
});

test('all four pair stages are analysed and one-move pair savings stay below the coach threshold', async () => {
  const g = GOLD.normal;
  const moves = g.moves.split(' ').slice(0, 23);   // the cross and four pairs
  const record = await analysed({ at: 6, scramble: g.scramble, solveMoves: moves, moveCount: moves.length, solved: true, crossFace: 'D', moveTimes: timesFor(moves.length) });
  assert.equal(record.analysis.pairs.length, 4, 'all four pair stages are searched');
  assert.ok(record.analysis.pairs.every(p => p.options.length), 'each pair has a ranked completion');
  assert.equal(record.analysis.pairs[0].better, null);
  assert.equal(record.analysis.pairs[1].better, null);
  assert.equal(record.analysis.pairs[2].better.moves, "R' U2 R");
  const markers = buildMarkers({ record, stages: [], plan: PLAN }).markers.filter(m => m.kind === 'better-pair');
  assert.deepEqual(markers, [], 'the coach reserves markers for savings of at least two moves');
});

test('the worker handler answers with the compact summary and a fresh memo per request', async () => {
  const solver = await solverPromise;
  const g = GOLD.normal;
  const posted = [];
  const handle = createAnalysisHandler(() => cachedSolver(solver), message => posted.push(message));
  const input = { scramble: g.scramble, moves: g.moves.split(' ').slice(0, 8), crossFace: 'D' };
  await handle({ type: 'analyze', id: 7, input, options: { pairs: true }, summary: true });
  assert.equal(posted[0].type, 'result');
  assert.equal(posted[0].id, 7);
  assert.equal(posted[0].result.v, SUMMARY_VERSION);
  assert.equal(posted[0].result.face, 'D');
  assert.equal(posted[0].result.cross.done, true);
  await handle({ type: 'analyze', id: 8, input: { scramble: 'R', moves: ['Q'] }, summary: true });
  assert.equal(posted[1].type, 'error');
});

test('the worker handler streams compact pair partials before its final summary', async () => {
  const solver = await solverPromise;
  const fixture = GOLD.normal;
  const posted = [];
  const handle = createAnalysisHandler(() => cachedSolver(solver), message => posted.push(message));
  await handle({
    type: 'analyze', id: 70,
    input: { scramble: fixture.scramble, moves: fixture.moves.split(' '), crossFace: 'D' },
    options: { pairs: true }, summary: true,
  });
  const progress = posted.filter(message => message.type === 'progress');
  assert.ok(progress.length >= 2, 'each pair publishes a quick result and a refined result');
  assert.ok(progress.some(message => message.result.pairs.some(pair => pair.pendingUpgrade)), 'quick result is marked as an upgrade in progress');
  assert.ok(progress.some(message => message.result.pairs.length && message.result.pairs.every(pair => !pair.pendingUpgrade)), 'a completed group of refinements clears its pending flags');
  assert.equal(posted.at(-1).type, 'result');
  assert.ok(posted.at(-1).result.pairs.every(pair => !pair.pendingUpgrade));
});

// A stand-in for the Worker: answers every request through `reply(message)`.
function fakeWorker(reply) {
  const worker = {
    posted: [], terminated: false,
    postMessage(message) { worker.posted.push(message); setImmediate(() => reply(message, data => worker.onmessage?.({ data }))); },
    terminate() { worker.terminated = true; },
  };
  return worker;
}

test('the analysis client loads the worker lazily, runs one at a time, caches per record, and never rejects', async () => {
  let created = 0;
  let worker;
  const client = createAnalysisClient({ idleMs: 20, createWorker: () => { created++; return worker = fakeWorker((m, send) => send({ type: 'result', id: m.id, result: { v: 1, marker: m.input.scramble } })); } });
  assert.equal(created, 0, 'nothing loads until the first analysis');
  const a = { at: 1, scramble: 'R U', solveMoves: ['R'], moveCount: 1, solved: true, config: { oll: '2look', pll: '1look' } };
  const b = { ...a, at: 2, scramble: 'F' };
  const [ra, rb] = await Promise.all([client.analyze(a), client.analyze(b)]);
  assert.deepEqual([ra.marker, rb.marker], ['R U', 'F']);
  assert.equal(created, 1);
  assert.equal(worker.posted.length, 2);
  assert.equal(worker.posted[0].summary, true);
  assert.deepEqual(worker.posted[0].options, { pairs: true, config: { oll: '2look', pll: '1look' } });
  assert.equal((await client.analyze(a)).marker, 'R U');
  assert.equal(worker.posted.length, 2, 'cached per record `at`');
  assert.equal(await client.analyze({ ...a, at: 3, solveMoves: [], moveCount: 0 }), null, 'not analysable');
  assert.equal(worker.posted.length, 2);
  const stored = { v: SUMMARY_VERSION, engine: ENGINE_VERSION, stored: true };
  assert.equal(await client.analyze({ ...a, at: 4, analysis: stored }), stored, 'a stored summary is used as is');
  const stale = { v: 2, engine: ENGINE_VERSION - 1, stale: true };
  assert.equal((await client.analyze({ ...a, at: 5, analysis: stale })).marker, 'R U', 'a prior engine summary is recomputed');
  assert.equal(worker.posted.length, 3);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(worker.terminated, true, 'the idle worker is dropped');
  client.destroy();
});

test('incremental summaries reach the review before the final result and can resume a stored partial', async () => {
  const seen = [];
  let runs = 0;
  const worker = fakeWorker((message, send) => {
    runs++;
    const partial = { v: 2, engine: ENGINE_VERSION, pairs: [{ n: 1, pendingUpgrade: true }] };
    send({ type: 'progress', id: message.id, result: partial });
    send({ type: 'result', id: message.id, result: { ...partial, pairs: [{ n: 1, pendingUpgrade: false }] } });
  });
  const client = createAnalysisClient({ createWorker: () => worker, idleMs: 1000 });
  const record = { at: 765, scramble: 'R U', solveMoves: ['R'], moveCount: 1, solved: true };
  const final = await client.analyze(record, { onProgress: summary => seen.push(summary) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].pairs[0].pendingUpgrade, true);
  assert.equal(final.pairs[0].pendingUpgrade, false);
  const resumed = await client.analyze({ ...record, at: 766, analysis: seen[0] });
  assert.equal(resumed.pairs[0].pendingUpgrade, false, 'a persisted partial is recomputed after reload');
  assert.equal(runs, 2);
  client.destroy();
});

test('analysis cancellation reaches the worker and drops the pending request', async () => {
  let cancelled = false;
  const worker = {
    onmessage: null, onerror: null,
    postMessage(message) {
      if (message.type === 'cancel') {
        cancelled = true;
        setImmediate(() => worker.onmessage?.({ data: { type: 'error', id: message.id, message: 'Analysis cancelled' } }));
      }
    },
    terminate() {},
  };
  const client = createAnalysisClient({ createWorker: () => worker, idleMs: 1000 });
  const controller = new AbortController();
  const record = { at: 767, scramble: 'R U', solveMoves: ['R'], moveCount: 1, solved: true };
  const pending = client.analyze(record, { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert.equal(await pending, null);
  assert.equal(cancelled, true);
  client.destroy();
});

test('a failing analysis resolves to null and is retried next time', async () => {
  let calls = 0;
  const client = createAnalysisClient({ createWorker: () => fakeWorker((m, send) => { calls++; send(calls === 1 ? { type: 'error', id: m.id, message: 'boom' } : { type: 'result', id: m.id, result: { v: 1 } }); }) });
  const record = { at: 9, scramble: 'R', solveMoves: ['R'], moveCount: 1, solved: true };
  assert.equal(await client.analyze(record), null);
  assert.deepEqual(await client.analyze(record), { v: 1 });
  client.destroy();
});
