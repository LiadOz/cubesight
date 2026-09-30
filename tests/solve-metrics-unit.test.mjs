import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTPS, ao5, summarize, rollingTrend, trendGroups,
  phaseSplits, weakCases, median,
} from '../src/solve-metrics.js';
import { ao12, resultMs, isDnf } from '../src/solve-metrics.js';
import { loadSolves, saveSolves, appendSolve } from '../src/solve-store.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: k => data.delete(k),
  };
}

function rec(solveMs, moveCount, extra = {}) {
  return {
    at: extra.at ?? Date.now(),
    scramble: 'R U',
    free: false,
    crossFace: 'D',
    crossColor: 'yellow',
    solveMs,
    moveCount,
    solveMoves: [],
    tps: computeTPS(moveCount, solveMs),
    phases: extra.phases ?? null,
    xcross: extra.xcross ?? null,
    rotations: 0, detours: 0, mistakes: extra.mistakes ?? 0,
    pllCase: extra.pllCase ?? null,
    ollCase: extra.ollCase ?? null,
    solved: extra.solved !== false,
  };
}

test('computeTPS is moves / seconds and null on bad input', () => {
  assert.equal(computeTPS(60, 12000), 5);
  assert.equal(computeTPS(0, 1000), 0);
  assert.equal(computeTPS(60, null), null);
  assert.equal(computeTPS(60, 0), null);
});

test('ao5 is a trimmed mean of the last 5 and null until then', () => {
  assert.equal(ao5([rec(1000, 50), rec(2000, 50), rec(1500, 50)]), null);
  const five = [rec(1000, 50), rec(2000, 50), rec(1500, 50), rec(1200, 50), rec(1800, 50)];
  // drop best(1000) and worst(2000), mean of [1500,1200,1800] = 1500
  assert.equal(ao5(five), 1500);
});

test('summarize reports counts, best, median, ao5 and tps', () => {
  const rs = [rec(1000, 50), rec(2000, 50), rec(1500, 50), rec(1200, 50), rec(1800, 50), rec(900, 45)];
  const s = summarize(rs);
  assert.equal(s.count, 6);
  assert.equal(s.solvedCount, 6);
  assert.equal(s.bestSolveMs, 900);
  assert.equal(s.ao5, 1500);
  assert.ok(s.medianTPS > 0);
});

test('phaseSplits averages phases and computes share of total', () => {
  const rs = [
    rec(10000, 60, { phases: { crossMs: 2000, f2lMs: 4000, ollMs: 2000, pllMs: 2000 } }),
    rec(12000, 60, { phases: { crossMs: 3000, f2lMs: 5000, ollMs: 2000, pllMs: 2000 } }),
  ];
  const ps = phaseSplits(rs);
  assert.equal(ps.crossMs, 2500);
  assert.equal(ps.f2lMs, 4500);
  // shares are of the average phase total (2500+4500+2000+2000 = 11000)
  assert.ok(Math.abs(ps.f2lPct - 4500 / 11000 * 100) < 0.01);
});

test('aggregateByCase and weakCases rank lowest accuracy then slowest', () => {
  const rs = [
    rec(10000, 60, { pllCase: 'T' }),
    rec(10000, 60, { pllCase: 'T' }),
    rec(8000, 60, { pllCase: 'Ua' }),
    rec(20000, 60, { pllCase: 'Z', solved: false }),
    rec(20000, 60, { pllCase: 'Z', solved: false }),
  ];
  const weak = weakCases(rs, 'pllCase', 6, 2);
  assert.equal(weak[0].case, 'Z');     // 0% accuracy, 2 attempts
  assert.equal(weak[0].accuracy, 0);
});

test('rollingTrend produces a trailing mean of tps over time', () => {
  const rs = [rec(10000, 50), rec(9000, 50), rec(8000, 50), rec(7000, 50)];
  const t = rollingTrend(rs, 'tps', 2);
  assert.equal(t.length, 4);
  // last window mean = mean of last two tps values
  assert.ok(Math.abs(t.at(-1).value - median([rs.at(-2).tps, rs.at(-1).tps])) < 1e-9);
});

test('trendGroups groups solves by day and never merges across a 30-min session gap', () => {
  const base = Date.parse('2025-01-01T10:00:00Z');
  const rs = [
    rec(10000, 50, { at: base }),
    rec(10000, 50, { at: base + 10 * 60 * 1000 }),
    rec(10000, 50, { at: base + 60 * 60 * 1000 }), // 50 min later -> new session
  ];
  const bySession = trendGroups(rs, 'session');
  assert.equal(bySession.length, 2);
  const byDay = trendGroups(rs, 'day');
  assert.equal(byDay.length, 1);
});

test('solve-store round-trips records and bounds the history', () => {
  const storage = memoryStorage();
  let records = loadSolves(storage);
  assert.equal(records.length, 0);
  for (let i = 0; i < 5; i++) records = appendSolve(storage, records, rec(10000 + i, 55));
  assert.equal(records.length, 5);
  const reloaded = loadSolves(storage);
  assert.equal(reloaded.length, 5);
  assert.equal(reloaded[0].tps, computeTPS(55, 10000));
  // cap is enforced by saveSolves
  const big = Array.from({ length: 1500 }, (_, i) => rec(10000 + i, 55));
  saveSolves(storage, big);
  assert.equal(loadSolves(storage).length, 1000);
});

test('appendSolve ignores malformed records', () => {
  const storage = memoryStorage();
  let records = [];
  records = appendSolve(storage, records, { not: 'a record' });
  assert.equal(records.length, 0);
  records = appendSolve(storage, records, rec(10000, 55));
  assert.equal(records.length, 1);
});

test('summarize ignores untimed records for the best time (no 0.00s best)', () => {
  const rs = [rec(1500, 50), rec(null, 40), rec(1200, 50)];
  assert.equal(summarize(rs).bestSolveMs, 1200);
  assert.equal(summarize([rec(null, 40)]).bestSolveMs, null);
});

test('penalties: +2 adds two seconds, DNF is the worst result (WCA averaging)', () => {
  const p = (ms, penalty) => ({ ...rec(ms, 50), penalty });
  assert.equal(resultMs(p(1000, '+2')), 3000);
  assert.equal(resultMs(p(1000, 'DNF')), Infinity);
  assert.equal(resultMs(p(1000, null)), 1000);
  // one DNF is dropped as the worst
  const oneDnf = [p(1000), p(2000, 'DNF'), p(1500), p(1200), p(1800)];
  assert.equal(ao5(oneDnf), 1500);
  // +2 counts toward the average
  const plus2 = [p(1000), p(1000, '+2'), p(1500), p(1200), p(9000)];
  assert.equal(ao5(plus2), (3000 + 1500 + 1200) / 3);
  // two DNFs make the average a DNF
  const twoDnf = [p(1000), p(2000, 'DNF'), p(1500), p(1200, 'DNF'), p(1800)];
  assert.equal(ao5(twoDnf), Infinity);
  assert.equal(isDnf(ao5(twoDnf)), true);
  const twelve = Array.from({ length: 12 }, (_, i) => p(1000 + i * 100, i === 3 ? 'DNF' : null));
  assert.ok(Number.isFinite(ao12(twelve)));
  twelve[5] = p(1000, 'DNF');
  assert.equal(ao12(twelve), Infinity);
  // summarize: best/mean use official results and skip DNFs
  const s = summarize([p(1000, '+2'), p(2500), p(500, 'DNF')]);
  assert.equal(s.bestSolveMs, 2500);
  assert.equal(s.dnfCount, 1);
  assert.equal(s.meanSolveMs, 2750);
});
