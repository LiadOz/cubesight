// Pure solve statistics over a list of stored solve records.
//
// These functions hold no device or UI state; they derive speedcubing metrics
// (TPS, phase split averages, ao5/ao12 trimmed averages, per-case weakness
// rankings, long-term trends) from persisted records. Keeping them pure lets
// trainers and tests reuse them without a connected cube or a browser.
//
// Trimmed averages (ao5/ao12) follow the WCA convention: the mean of the
// middle results after dropping the single best and single worst of the last N.
// Using trimmed means rather than a plain mean reduces the skew from a
// catastrophic pop or a single lucky skip — the same reason they are the
// standard competition statistic (WCA Regulations §9f).

const DAY = 24 * 60 * 60 * 1000;

export const SOLVE_STORE_KEY = 'cubesight-solves-v1';
export const SOLVE_STORE_CAP = 1000;

const num = (x) => (Number.isFinite(x) && x >= 0 ? x : null);

// Turns per second from a solve's move count and duration.
export function computeTPS(moveCount, solveMs) {
  const moves = num(moveCount);
  const ms = num(solveMs);
  if (moves === null || ms === null || ms <= 0) return null;
  return moves / (ms / 1000);
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function mean(values) {
  const nums = values.filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Official result of a timed solve under its inspection penalty: +2 adds two
// seconds, a DNF is Infinity (worse than any time, so it sorts last and is the
// "worst" dropped by a trimmed average). null when the solve has no time.
export const PLUS_TWO_MS = 2000;
export function resultMs(record) {
  if (!record) return null;
  if (record.penalty === 'DNF') return Infinity;
  const ms = num(record.solveMs);
  if (ms === null) return null;
  return record.penalty === '+2' ? ms + PLUS_TWO_MS : ms;
}
export const isDnf = value => value === Infinity;

// Trimmed mean of the last `n` records' `field`: drop the best and worst, mean
// the rest. Returns null until enough records exist (>= 5 for ao5, etc.), again
// matching competition reporting which only reports an average once it is full.
// For solve times, inspection penalties apply (WCA 9f): +2 counts, a DNF is the
// worst result, and two or more DNFs make the average a DNF (Infinity).
export function trimmedAverage(records, n, field = 'solveMs') {
  const value = field === 'solveMs' ? resultMs : r => num(r[field]);
  const last = records.filter(r => r && value(r) !== null).slice(-n).map(value);
  if (last.length < n) return null;
  const sorted = [...last].sort((a, b) => a - b);
  const middle = sorted.slice(1, -1);
  if (middle.some(isDnf)) return Infinity;
  return mean(middle);
}

export const ao5 = (records, field = 'solveMs') => trimmedAverage(records, 5, field);
export const ao12 = (records, field = 'solveMs') => trimmedAverage(records, 12, field);

// A trailing mean follows recent change instead of fitting one line through a
// long history; it is less misleading than a global regression when skill
// improves nonlinearly (as motor learning does — see cross-sectional vs.
// longitudinal practice-curve work, e.g. Newell & Rosenbloom 1981).
export function rollingTrend(records, field = 'tps', windowSize = 5) {
  const valid = records
    .filter(r => num(r[field]) !== null)
    .map((r, index) => ({ index, value: r[field] }));
  return valid.map((point, index) => {
    const w = valid.slice(Math.max(0, index - windowSize + 1), index + 1);
    return { x: point.index, value: w.reduce((s, p) => s + p.value, 0) / w.length };
  });
}

// Group records into day/session buckets for a long-term trend; solves share
// the recognition-profile grouping intent (sessions inferred from a 30-min gap).
export function trendGroups(records, grouping = 'day') {
  const sorted = records
    .filter(r => Number.isFinite(r.at))
    .sort((a, b) => a.at - b.at);
  const groups = [];
  for (const record of sorted) {
    let g = groups[groups.length - 1];
    const date = new Date(record.at);
    const key = grouping === 'session' ? null : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (grouping === 'session' && (!g || record.at - g.lastAt > 30 * 60 * 1000)) g = null;
    if (grouping === 'day' && (!g || g.key !== key)) g = null;
    if (!g) { g = { key: grouping === 'session' ? `session-${record.at}` : key, firstAt: record.at, lastAt: record.at, records: [] }; groups.push(g); }
    g.records.push(record);
    g.lastAt = record.at;
  }
  return groups.map(g => {
    const solved = g.records.filter(r => r.solved);
    const tps = solved.map(r => r.tps).filter(Number.isFinite);
    const solveMs = solved.map(r => r.solveMs).filter(Number.isFinite);
    return {
      key: g.key,
      firstAt: g.firstAt,
      count: g.records.length,
      solvedCount: solved.length,
      medianSolveMs: median(solveMs),
      medianTPS: median(tps),
      medianMoveCount: median(solved.map(r => r.moveCount)),
      meanTPS: mean(tps),
    };
  });
}

// Overall summary for a header strip: counts, current ao, lifetime mean/best.
export function summarize(records) {
  const solved = records.filter(r => r.solved);
  // Official results (penalties applied); DNFs and untimed solves (null) are
  // excluded from best/median/mean — a missing clock must not read as 0.00s.
  const results = solved.map(resultMs);
  const solveMs = results.filter(Number.isFinite);
  const tps = solved.map(r => r.tps).filter(Number.isFinite);
  const moveCounts = solved.map(r => r.moveCount);
  return {
    count: records.length,
    solvedCount: solved.length,
    dnfCount: results.filter(isDnf).length,
    bestSolveMs: solveMs.length ? Math.min(...solveMs) : null,
    medianSolveMs: median(solveMs),
    meanSolveMs: mean(solveMs),
    ao5: ao5(records),
    ao12: ao12(records),
    medianTPS: median(tps),
    meanTPS: mean(tps),
    medianMoveCount: median(moveCounts),
  };
}

// Average phase split (cross / F2L / OLL / PLL), both absolute and as a share
// of the average solved time. Reveals which phase dominates and is the
// cheapest improvement target — the same rationale as a phase split analysis.
export function phaseSplits(records) {
  const withPhases = records.filter(r => r.solved && r.phases && Object.values(r.phases).every(Number.isFinite));
  if (!withPhases.length) return null;
  const avg = (field) => mean(withPhases.map(r => r.phases[field]));
  const cross = avg('crossMs');
  const f2l = avg('f2lMs');
  const oll = avg('ollMs');
  const pll = avg('pllMs');
  const total = (cross ?? 0) + (f2l ?? 0) + (oll ?? 0) + (pll ?? 0) || 1;
  return {
    crossMs: cross, f2lMs: f2l, ollMs: oll, pllMs: pll,
    crossPct: cross / total * 100,
    f2lPct: f2l / total * 100,
    ollPct: oll / total * 100,
    pllPct: pll / total * 100,
    samples: withPhases.length,
  };
}

// Aggregate by a case field (e.g. 'pllCase', 'ollCase') for weak-case surfacing.
// Returns entries ranked worst-first: lowest accuracy, then slowest median time.
export function aggregateByCase(records, field) {
  const groups = new Map();
  for (const r of records) {
    const key = r?.[field];
    if (!key) continue;
    const g = groups.get(key) || { case: key, attempts: 0, solved: 0, times: [], tps: [] };
    g.attempts++;
    if (r.solved) {
      g.solved++;
      if (Number.isFinite(r.solveMs)) g.times.push(r.solveMs);
      if (Number.isFinite(r.tps)) g.tps.push(r.tps);
    }
    groups.set(key, g);
  }
  return [...groups.values()].map(g => ({
    case: g.case,
    attempts: g.attempts,
    accuracy: g.solved / g.attempts,
    medianSolveMs: median(g.times),
    medianTPS: median(g.tps),
  }));
}

// Cases most needing attention: lowest accuracy first (errors), then slowest
// median among cases with enough samples. `minAttempts` avoids ranking cases
// seen only once, which would be noise rather than a reliable weakness signal.
export function weakCases(records, field, limit = 6, minAttempts = 2) {
  return aggregateByCase(records, field)
    .filter(g => g.attempts >= minAttempts)
    .sort((a, b) => {
      // Worst first: lowest accuracy, then slowest median (nulls sort as slow
      // so error-only cases do not get hidden behind timed cases).
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      const am = a.medianSolveMs ?? Infinity;
      const bm = b.medianSolveMs ?? Infinity;
      return bm - am;
    })
    .slice(0, limit);
}

export { median, mean };
