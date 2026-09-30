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
// Cap of the legacy localStorage store only; the IndexedDB history (src/store)
// has no cap.
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

// WCA trimming (Regulation 9f): an average of N drops the best and worst
// ceil(5% of N) results (1 for ao5/ao12, 3 for ao50, 5 for ao100). More DNFs
// than the trim removes make the average a DNF (Infinity). Integer arithmetic
// (n / 20) avoids float error in 5% of n.
export const trimCount = n => Math.ceil(n / 20);

// Timed results of a record list, oldest first: penalties applied, untimed
// records skipped (a missing clock is not a result).
const timedResults = (records, value = resultMs) => records.filter(r => r && value(r) !== null).map(value);

function trimmedOf(results, n) {
  if (results.length < n) return null;
  const last = results.slice(-n);
  const cut = Math.min(trimCount(n), Math.floor((n - 1) / 2));
  const middle = [...last].sort((a, b) => a - b).slice(cut, n - cut);
  if (middle.some(isDnf)) return Infinity;
  return mean(middle);
}

// Trimmed mean of the last `n` records' `field`: drop the best and worst
// ceil(5%), mean the rest. Returns null until enough records exist (>= 5 for
// ao5, etc.), matching competition reporting which only reports an average
// once it is full. For solve times, inspection penalties apply (+2 counts, a
// DNF is the worst result).
export function trimmedAverage(records, n, field = 'solveMs') {
  const value = field === 'solveMs' ? resultMs : r => num(r[field]);
  return trimmedOf(timedResults(records, value), n);
}

export const ao5 = (records, field = 'solveMs') => trimmedAverage(records, 5, field);
export const ao12 = (records, field = 'solveMs') => trimmedAverage(records, 12, field);
export const ao50 = (records, field = 'solveMs') => trimmedAverage(records, 50, field);
export const ao100 = (records, field = 'solveMs') => trimmedAverage(records, 100, field);

function mo3Of(results) {
  if (results.length < 3) return null;
  const last = results.slice(-3);
  return last.some(isDnf) ? Infinity : mean(last);
}

// Mean of 3: no trimming, so a single DNF makes it a DNF (WCA format "mo3").
export const mo3 = records => mo3Of(timedResults(records));

// Best finished average of `n` (3 = mo3) anywhere in the list, a PB average:
// the lowest finite value of the rolling window. null when none finished.
export function bestAverage(records, n) {
  const results = timedResults(records);
  let best = null;
  for (let end = n; end <= results.length; end++) {
    const window = results.slice(end - n, end);
    const value = n === 3 ? mo3Of(window) : trimmedOf(window, n);
    if (Number.isFinite(value) && (best === null || value < best)) best = value;
  }
  return best;
}

// Full statistics block for one scope (a session or all time). Best and worst
// are the fastest and slowest finished results (+2 applied; DNFs and untimed
// solves are excluded and counted in `dnfCount`); the current averages are
// over the most recent solves in the scope, the `best*` fields are the best
// rolling average inside it.
export function scopeStats(records) {
  const results = timedResults(records);
  const finite = results.filter(Number.isFinite);
  return {
    count: records.length,
    timedCount: results.length,
    dnfCount: results.filter(isDnf).length,
    best: finite.length ? Math.min(...finite) : null,
    worst: finite.length ? Math.max(...finite) : null,
    mean: mean(finite),
    mo3: mo3Of(results),
    ao5: trimmedOf(results, 5),
    ao12: trimmedOf(results, 12),
    ao50: trimmedOf(results, 50),
    ao100: trimmedOf(results, 100),
    bestMo3: bestAverage(records, 3),
    bestAo5: bestAverage(records, 5),
    bestAo12: bestAverage(records, 12),
    bestAo50: bestAverage(records, 50),
    bestAo100: bestAverage(records, 100),
  };
}

// --- Focus metrics ----------------------------------------------------------------------------
// Flow and learning sessions care about different numbers than speed ones
// (src/store/focus.js). Call these with the records of ONE focus.

function stdDev(values, sample = false) {
  const nums = values.filter(Number.isFinite);
  const n = nums.length;
  if (n < (sample ? 2 : 1)) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(nums.reduce((a, b) => a + (b - avg) ** 2, 0) / (sample ? n - 1 : n));
}

// Rhythm of one solve from its per-move times (ms since the solve started):
// the gaps between consecutive moves, their coefficient of variation (std /
// mean: 0 is a metronome) and the pause count (gaps longer than 2x the solve's
// median gap). null without at least 3 move times.
export function flowSolve(record) {
  const times = Array.isArray(record?.moveTimes) ? record.moveTimes.filter(Number.isFinite) : [];
  if (times.length < 3) return null;
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push(Math.max(0, times[i] - times[i - 1]));
  const avg = mean(gaps);
  const med = median(gaps);
  if (!avg || !med) return null;
  return { cv: stdDev(gaps) / avg, pauses: gaps.filter(g => g > 2 * med).length, medianGapMs: med };
}

// Flow numbers: mean TPS, the spread of TPS across solves (sample standard
// deviation) and, for solves that have move times, the mean gap consistency
// (CV, lower is steadier) and the pauses per solve.
export function flowStats(records) {
  const solved = records.filter(r => r.solved);
  const tps = solved.map(r => r.tps).filter(Number.isFinite);
  const rhythms = solved.map(flowSolve).filter(Boolean);
  const pauses = rhythms.reduce((sum, r) => sum + r.pauses, 0);
  return {
    solves: tps.length,
    meanTps: mean(tps),
    tpsStd: stdDev(tps, true),
    rhythmSolves: rhythms.length,
    gapCv: rhythms.length ? mean(rhythms.map(r => r.cv)) : null,
    pauses: rhythms.length ? pauses : null,
    pausesPerSolve: rhythms.length ? pauses / rhythms.length : null,
  };
}

// Learning numbers: how many moves the solves took and, once the solve review
// (src/analysis) writes `reviewAccuracy` (0..100) onto records, its average.
// `reviewAccuracy` stays null until then: this is the documented hook.
export function learningStats(records) {
  const solved = records.filter(r => r.solved);
  const moves = solved.map(r => r.moveCount).filter(Number.isFinite);
  const accuracy = solved.map(r => r.reviewAccuracy).filter(Number.isFinite);
  return {
    solves: solved.length,
    meanMoves: mean(moves),
    medianMoves: median(moves),
    bestMoves: moves.length ? Math.min(...moves) : null,
    reviewedSolves: accuracy.length,
    reviewAccuracy: accuracy.length ? mean(accuracy) : null,
  };
}

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
