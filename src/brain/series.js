// Chart data for the Brain results screen. Pure: every function takes plain
// numbers/records and returns the shapes in types.js (TpsSeries, SplitRow,
// donut arcs, sparkline points).

import { resultMs, isDnf } from '../solve-metrics.js';
import { fmtTime, fmtDelta, deltaTone } from './format.js';

const TPS_SIGMA_MS = 450;     // Gaussian kernel width for the TPS line (a hard window saw-tooths)
const TPS_STEP_MS = 100;      // sample spacing
const PAUSE_MS = 800;         // a gap between moves this long is marked as a pause

/**
 * TPS over the solve.
 * @param {number[]} moveTimes  ms since solve start, one per move
 * @param {{durationMs:number, stages?:{key:string,label:string,startAt:number,endAt:number,skipped:boolean}[],
 *   solveStartAt?:number, averages?:{byKey:Object}, avgFlat?:number|null}} opts
 * @returns {import('./types.js').TpsSeries}
 */
export function tpsSeries(moveTimes = [], { durationMs = null, stages = [], solveStartAt = 0, averages = null, avgFlat = null } = {}) {
  const times = moveTimes.filter(Number.isFinite).sort((a, b) => a - b);
  const duration = Math.max(Number.isFinite(durationMs) ? durationMs : 0, times[times.length - 1] ?? 0);
  const points = [];
  if (duration > 0) {
    // Kernel density of the move times, in moves per second. Near the ends the
    // kernel is renormalised by its mass inside [0, duration] so the line
    // doesn't sag at the start and finish.
    const k = 1 / (TPS_SIGMA_MS * Math.sqrt(2 * Math.PI));
    const cdf = x => 0.5 * (1 + erf(x / (TPS_SIGMA_MS * Math.SQRT2)));
    for (let tMs = 0; tMs <= duration + 1e-6; tMs += TPS_STEP_MS) {
      let density = 0;
      for (const x of times) { const d = tMs - x; density += k * Math.exp(-(d * d) / (2 * TPS_SIGMA_MS * TPS_SIGMA_MS)); }
      const mass = Math.max(0.5, cdf(duration - tMs) - cdf(-tMs));
      points.push({ tMs: Math.round(tMs), tps: (density / mass) * 1000 });
    }
    if (points[points.length - 1].tMs < duration) points.push({ tMs: duration, tps: points[points.length - 1].tps });
  }
  const bands = stages.filter(s => s.endAt != null && s.startAt != null)
    .map(s => ({ key: s.key, label: s.label ?? s.key, fromMs: s.startAt - solveStartAt, toMs: s.endAt - solveStartAt }));
  const avg = averages ? bands.map(b => {
    const a = averages.byKey?.[b.key];
    const tps = a && a.avgMs > 0 ? a.avgMoves / (a.avgMs / 1000) : null;
    return tps == null ? null : { fromMs: b.fromMs, toMs: b.toMs, tps };
  }).filter(Boolean) : [];
  // The two longest pauses, and every skipped stage.
  const gaps = [];
  let prev = 0;
  for (const t of times) { if (t - prev >= PAUSE_MS) gaps.push({ from: prev, to: t }); prev = t; }
  const marks = gaps.sort((a, b) => (b.to - b.from) - (a.to - a.from)).slice(0, 2)
    .map(g => ({ tMs: Math.round((g.from + g.to) / 2), kind: 'pause', label: `${((g.to - g.from) / 1000).toFixed(1)} s pause` }))
    .concat(stages.filter(s => s.skipped && s.startAt != null).map(s => ({ tMs: s.startAt - solveStartAt, kind: 'skip', label: `${s.label ?? s.key} skip` })))
    .sort((a, b) => a.tMs - b.tMs);
  const peak = Math.max(0, ...points.map(p => p.tps), ...avg.map(a => a.tps), avgFlat ?? 0);
  return { points, avg, avgFlat: Number.isFinite(avgFlat) ? avgFlat : null, bands, marks, durationMs: duration, maxTps: Math.max(2, Math.ceil(peak / 2) * 2) };
}

/**
 * Rows for the split bars. `compare` picks the reference: 'avg' (default),
 * 'pb' (best split), or 'raw' (no delta).
 * @returns {import('./types.js').SplitRow[]}
 */
export function splitRows(stages, plan, averages, { compare = 'avg', pbs = {} } = {}) {
  const labelOf = key => plan.find(s => s.key === key)?.label ?? key;
  const rows = stages.map(s => {
    const avgMs = averages?.byKey?.[s.key]?.avgMs ?? null;
    const ref = compare === 'pb' ? pbs[s.key] ?? null : compare === 'avg' ? avgMs : null;
    const delta = !s.skipped && !s.merged && s.ms != null && ref != null ? s.ms - ref : null;
    return {
      key: s.key, label: labelOf(s.key), ms: s.ms,
      text: s.skipped ? 'skip' : s.merged ? 'merged' : fmtTime(s.ms),
      deltaText: delta == null ? '' : fmtDelta(delta),
      tone: delta == null ? 'none' : deltaTone(delta),
      moves: s.moves, avgMs, ratio: 0, avgRatio: 0, skipped: Boolean(s.skipped), merged: Boolean(s.merged), pseudo: Boolean(s.pseudo),
    };
  });
  const scale = Math.max(1, ...rows.map(r => Math.max(r.ms ?? 0, r.avgMs ?? 0)));
  for (const r of rows) { r.ratio = (r.ms ?? 0) / scale; r.avgRatio = (r.avgMs ?? 0) / scale; }
  return rows;
}

/** Donut arcs: each stage's share of the solve, toned against its average. */
export function donutArcs(stages, plan, averages) {
  const total = stages.reduce((sum, s) => sum + (s.ms ?? 0), 0);
  return stages.map(s => {
    const avgMs = averages?.byKey?.[s.key]?.avgMs;
    const tone = s.skipped ? 'skip' : s.merged ? 'none' : avgMs == null || s.ms == null ? 'none' : deltaTone(s.ms - avgMs);
    return { key: s.key, label: plan.find(p => p.key === s.key)?.short ?? s.key, fraction: total > 0 ? (s.ms ?? 0) / total : 0, tone };
  });
}

/**
 * History sparkline over the last `count` records (oldest first). The best
 * result is marked pb, +2 and DNF results are marked, and the latest record
 * is 'current' when `currentAt` matches it.
 */
export function sparkline(records = [], { count = 23, currentAt = null } = {}) {
  const recent = records.slice(-count);
  const results = recent.map(resultMs);
  const finite = results.filter(v => Number.isFinite(v));
  const best = records.map(resultMs).filter(Number.isFinite);
  const pb = best.length ? Math.min(...best) : null;
  const points = recent.map((r, i) => {
    const ms = results[i];
    let kind = 'normal';
    if (currentAt != null && r.at === currentAt) kind = 'current';
    else if (isDnf(ms)) kind = 'dnf';
    else if (r.penalty === '+2') kind = 'plus2';
    else if (pb != null && ms === pb) kind = 'pb';
    return { i, ms: Number.isFinite(ms) ? ms : null, kind };
  });
  return { points, min: finite.length ? Math.min(...finite) : 0, max: finite.length ? Math.max(...finite) : 0 };
}

// Abramowitz–Stegun 7.1.26 (error < 1.5e-7), enough for chart smoothing.
function erf(x) {
  const sign = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}
