import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendSolve, loadSolves, updateSolve } from '../src/solve-store.js';
import { ao5, resultMs } from '../src/solve-metrics.js';
import { createSolvedState, stateFromScramble } from '../src/cross-cube.js';
import { cpSolved, analyze } from '../src/solve-tracker.js';

const memoryStorage = () => {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
};

const record = (at, solveMs, extra = {}) => ({ at, solveMs, moveCount: 50, tps: 50 / (solveMs / 1000), solved: true, ...extra });

test('penalties, inspection and Brain v2 splits survive a reload', () => {
  const storage = memoryStorage();
  const splits = [{ key: 'cross', ms: 2080, moves: 8, skipped: false, pseudo: false }, { key: 'eo', ms: 0, moves: 0, skipped: true, pseudo: false }];
  const records = appendSolve(storage, [], record(1, 12970, {
    penalty: '+2', inspectionMs: 15800, inspectionMode: 'wca', splits, moveTimes: [100, 250.5], scrambleTurns: ['R', 'U2'],
    config: { method: 'cfop', oll: '2look', bogus: 'x' },
  }));
  appendSolve(storage, records, record(2, 13200, { penalty: 'DNF' }));
  const loaded = loadSolves(storage);
  assert.equal(loaded[0].penalty, '+2');
  assert.equal(loaded[0].inspectionMs, 15800);
  assert.equal(loaded[0].inspectionMode, 'wca');
  assert.deepEqual(loaded[0].splits, splits);
  assert.deepEqual(loaded[0].moveTimes, [100, 250.5]);
  assert.deepEqual(loaded[0].scrambleTurns, ['R', 'U2']);
  assert.deepEqual(loaded[0].config, { method: 'cfop', oll: '2look' });
  assert.equal(resultMs(loaded[0]), 14970);
  assert.equal(resultMs(loaded[1]), Infinity);
});

test('an unknown penalty is dropped, and averages use the persisted penalties', () => {
  const storage = memoryStorage();
  let records = [];
  for (const [i, ms] of [10000, 11000, 12000, 13000, 14000].entries()) records = appendSolve(storage, records, record(i + 1, ms, { penalty: i === 0 ? '+2' : null }));
  records = appendSolve(storage, records, record(9, 9000, { penalty: '+5' }));
  const loaded = loadSolves(storage);
  assert.equal(loaded[5].penalty, null);
  // Last five: 11, 12, 13, 14, 9 -> drop 9 and 14 -> mean 12.
  assert.equal(ao5(loaded), 12000);
});

test('updateSolve patches one stored record by timestamp and persists it', () => {
  const storage = memoryStorage();
  let records = appendSolve(storage, [], record(1, 10000));
  records = appendSolve(storage, records, record(2, 11000));
  const next = updateSolve(storage, records, 2, { penalty: 'DNF' });
  assert.notEqual(next, records);
  assert.equal(next[1].penalty, 'DNF');
  assert.equal(next[0].penalty, null);
  assert.equal(loadSolves(storage)[1].penalty, 'DNF');
  assert.equal(updateSolve(storage, next, 99, { penalty: '+2' }), next, 'no match leaves the list unchanged');
  assert.equal(updateSolve(storage, next, 2, { penalty: null })[1].penalty, null);
});

test('cpSolved: corners permuted up to AUF, whatever the edges do', () => {
  const solved = createSolvedState();
  assert.equal(cpSolved(solved, 'D'), true);
  assert.equal(cpSolved(stateFromScramble('U'), 'D'), true, 'an AUF away');
  // U-perm: a 3-cycle of edges only.
  const uPerm = stateFromScramble("R U' R U R U R U' R' U' R2");
  assert.equal(cpSolved(uPerm, 'D'), true);
  // T-perm swaps two corners (and two edges).
  const tPerm = stateFromScramble("R U R' U' R' F R2 U' R' U' R U R' F'");
  assert.equal(cpSolved(tPerm, 'D'), false);
  const a = analyze(uPerm, 'D');
  assert.equal(a.ollDone, true);
  assert.equal(a.cpDone, true);
  assert.equal(analyze(tPerm, 'D').cpDone, false);
});
