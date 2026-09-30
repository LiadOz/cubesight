// Solve records for the review tests, built without a browser: a real recording replayed through
// the live tracker (tests/fixtures/rotation-cross-recording.json, 95 moves, several rotations) and
// the golden solves of tests/analysis-golden.mjs, each analysed with the real WASM solver in node.
import fs from 'node:fs';
import { createSolveLive } from '../../src/solve-live.js';
import { createSmartCubeSession, APP_SESSION_OPTIONS } from '../../src/smart-cube-session.js';
import { createReplayDriver } from '../../src/recording-replay.js';
import { parseRecording } from '../../src/recorder.js';
import { analyzeSolve, summarizeAnalysis } from '../../src/analysis/index.js';
import { loadNodeSolver } from '../../src/analysis/node-solver.js';
import { cachedSolver } from '../../src/analysis/wasm-solver.js';
import { cleanRecord } from '../../src/solve-store.js';
import { buildStagePlan } from '../../src/brain/stage-plan.js';

const quiet = () => { const log = console.log; console.log = () => {}; return () => { console.log = log; }; };

/** The finished live record of the first solve in a recording. */
export async function replayRecord(file = '../fixtures/rotation-cross-recording.json') {
  const restore = quiet();
  try {
    const rec = parseRecording(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
    const driver = createReplayDriver(rec, { speed: 0 });
    const session = createSmartCubeSession(driver.connectDevice, { ...APP_SESSION_OPTIONS, now: driver.now, schedule: driver.schedule });
    const live = createSolveLive(session, { now: driver.now, getOrientation: () => driver.read('orientation', { bottom: 'D', front: 'F' }) });
    let record = null;
    live.subscribe(s => { if (s.phase === 'done' && s.record) record = s.record; });
    driver.setOnAction(a => (a.kind === 'session.call' ? session[a.method]?.(...(a.args || [])) : a.kind === 'live.call' ? live[a.method]?.(...(a.args || [])) : undefined));
    await driver.run();
    live.detach();
    return record;
  } finally { restore(); }
}

/** Evenly timed moves (ms since the solve start), with `pauses` = { moveIndex: extra ms before it }. */
export function timesFor(count, { step = 280, pauses = {} } = {}) {
  const times = [];
  let t = 0;
  for (let i = 0; i < count; i++) { t += step + (pauses[i] ?? 0); times.push(t); }
  return times;
}

/** Analyse a record with the real solver and store the summary on it (what the worker does in the app). */
export async function analysed(record, { pairs = true } = {}) {
  const solver = cachedSolver(await loadNodeSolver());
  const input = { scramble: record.scramble, moves: record.solveMoves, moveTimes: record.moveTimes ?? undefined, crossFace: record.crossFace ?? undefined };
  const result = analyzeSolve(input, solver, { pairs });
  return cleanRecord({ ...record, analysis: summarizeAnalysis(result) });
}

/** Stage rows the way the results view-model builds them from a record's splits (cumulative times). */
export function rowsFromSplits(record) {
  let at = 0;
  return (record.splits ?? []).map(s => {
    const row = { key: s.key, startAt: at, endAt: at + (s.ms ?? 0), ms: s.ms, moves: s.moves, skipped: s.skipped, merged: false };
    at += s.ms ?? 0;
    return row;
  });
}

export const PLAN = buildStagePlan({ method: 'cfop', oll: '2look', pll: '2look' });
export const FACE_COLORS = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' };
