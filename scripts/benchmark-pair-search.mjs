// Reproducible R2 engine benchmark over frozen setups. Do not generate inputs
// here: scripts/generate-pair-bench.mjs writes a fixture that stays constant
// across solver changes. All returned completions are checked independently
// with cubing.js before the run can pass.
import { readFile } from 'node:fs/promises';
import { cube3x3x3 } from 'cubing/puzzles';
import { bestCompletions, buildPairCrossTables, buildTables, crossSolved, SLOTS, solvedSlots, tableStats, trackedFrom } from '../src/analysis/pair-completion.js';

const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/pair-engine-bench-v1.json', import.meta.url), 'utf8'));
const budgetMs = Number(process.argv[2] ?? 2000);
const usePairCross = process.argv[3] === 'pair-cross';
if (!Number.isFinite(budgetMs) || budgetMs < 1) throw new Error('Pass a positive per-position budget in milliseconds.');
const kp = await cube3x3x3.kpuzzle();
const goalTurns = ['', "D'", 'D2', 'D'];
const tableStart = performance.now();
buildTables();
const tableColdMs = performance.now() - tableStart;
const optionalStart = performance.now();
if (usePairCross) buildPairCrossTables();
const optionalTableColdMs = performance.now() - optionalStart;
function matchesGoal(data, goal, kind, home) {
  const raw = data[kind], target = goal[kind];
  const from = raw.permutation.indexOf(home), wanted = target.permutation.indexOf(home);
  return from === wanted && raw.orientationDelta[from] === target.orientationDelta[wanted];
}
function independentlyValid(setup, option, beforeSlots) {
  const state = kp.algToTransformation(`${setup} ${option.moves}`).transformationData;
  const goal = kp.algToTransformation(goalTurns[option.goalShift]).transformationData;
  const crossOkay = [4, 5, 6, 7].every(home => matchesGoal(state, goal, 'EDGES', home));
  const preservedOkay = beforeSlots.every(index => {
    const slot = SLOTS[index];
    return matchesGoal(state, goal, 'EDGES', slot.e) && matchesGoal(state, goal, 'CORNERS', slot.c);
  });
  const added = SLOTS.some(slot => matchesGoal(state, goal, 'EDGES', slot.e) && matchesGoal(state, goal, 'CORNERS', slot.c)
    && !beforeSlots.includes(SLOTS.indexOf(slot)));
  return { crossOkay, preservedOkay, added };
}
const rows = [];
let verificationFailures = 0;
for (const input of fixture.positions) {
  const beforeSlots = solvedSlots(trackedFrom(input.setup), input.startShift);
  if (!crossSolved(trackedFrom(input.setup), input.startShift) || beforeSlots.length !== input.stage - 1) {
    throw new Error(`Frozen fixture state is invalid: ${input.id}`);
  }
  const started = performance.now();
  const result = bestCompletions(input.setup, { startShift: input.startShift, timeBudgetMs: budgetMs, maxDepth: 12, maxSolutions: 32, slack: 1, usePairCross });
  const wallMs = performance.now() - started;
  for (const candidate of result.candidates) for (const option of candidate.options) {
    const check = independentlyValid(input.setup, option, beforeSlots);
    if (!check.crossOkay || !check.preservedOkay || !check.added) verificationFailures++;
  }
  rows.push({ id: input.id, stage: input.stage, pseudo: input.pseudo, wallMs, searchMs: result.searchMs,
    candidateSlots: result.candidates.length, options: result.candidates.reduce((sum, candidate) => sum + candidate.options.length, 0),
    shortest: result.shortest, proven: result.proven, partial: !result.proven,
    searchedShifts: result.candidates.map(candidate => candidate.searchedGoalShifts.length),
    proofBounds: result.candidates.map(candidate => ({ shortest: candidate.shortest, shortestProven: candidate.shortestProven, through: candidate.completedThroughDepth, timedOut: candidate.timedOut })),
  });
}
const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
};
const memoryAfter = process.memoryUsage();
const result = {
  fixture: 'tests/fixtures/pair-engine-bench-v1.json',
  fixtureSeed: fixture.seed,
  inputs: rows.length,
  budgetMs,
  tableColdMs: Number(tableColdMs.toFixed(2)),
  optionalTables: { enabled: usePairCross, coldBuildMs: Number(optionalTableColdMs.toFixed(2)), stats: tableStats() },
  memory: {
    optionalPdbBytes: usePairCross ? 4 * 24 ** 4 : 0,
    processArrayBuffersAfterBytes: memoryAfter.arrayBuffers,
  },
  verificationFailures,
  proven: rows.filter(row => row.proven).length,
  partial: rows.filter(row => row.partial).length,
  latencyMs: { median: Number(quantile(rows.map(row => row.wallMs), .5).toFixed(2)), p95: Number(quantile(rows.map(row => row.wallMs), .95).toFixed(2)), max: Number(Math.max(...rows.map(row => row.wallMs)).toFixed(2)) },
  stages: [1, 2, 3, 4].map(stage => ({ stage, n: rows.filter(row => row.stage === stage).length, proven: rows.filter(row => row.stage === stage && row.proven).length, partial: rows.filter(row => row.stage === stage && row.partial).length })),
  pseudo: { n: rows.filter(row => row.pseudo).length, proven: rows.filter(row => row.pseudo && row.proven).length, partial: rows.filter(row => row.pseudo && row.partial).length },
  rows,
};
console.log(JSON.stringify(result, null, 2));
if (verificationFailures) throw new Error(`${verificationFailures} candidate verification failures.`);
