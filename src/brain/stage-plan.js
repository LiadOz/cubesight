// The Brain timeline's stages for the current settings, and the per-stage
// averages that size them (the timeline is a pace map: each segment is as
// wide as your average for that step). Pure.
//
// Stage keys are stable ids stored in solve records (record.splits[].key):
//   CFOP  cross | pair1..pair4 | eo co (2-look) or oll | cp ep (2-look) or pll
//         An x-cross includes pair 1 (xx-cross pairs 1 and 2), so those
//         pair segments are left out of the plan.
//   Roux  fb | sb | cmll | l6e  (mapped on CFOP milestones until Roux
//         detection exists; see solve-methods.js)

const CROSS_LABEL = { cross: 'cross', xcross: 'x-cross', xxcross: 'xx-cross' };

/** @typedef {{key:string, label:string, short:string, group:string|null}} StageDef */

/** @returns {StageDef[]} */
export function buildStagePlan(settings = {}) {
  if (settings.method === 'roux') {
    return [
      { key: 'fb', label: 'first block', short: 'fb', group: null },
      { key: 'sb', label: 'second block', short: 'sb', group: null },
      { key: 'cmll', label: 'cmll', short: 'cmll', group: null },
      { key: 'l6e', label: 'l6e', short: 'l6e', group: null },
    ];
  }
  const cross = settings.cross || 'cross';
  const firstPair = cross === 'xxcross' ? 3 : cross === 'xcross' ? 2 : 1;
  const plan = [{ key: 'cross', label: CROSS_LABEL[cross] || 'cross', short: cross === 'cross' ? 'x' : cross === 'xcross' ? 'xc' : 'xxc', group: null }];
  for (let n = firstPair; n <= 4; n++) plan.push({ key: `pair${n}`, label: `pair ${n}`, short: `p${n}`, group: 'f2l' });
  if (settings.oll === '1look') plan.push({ key: 'oll', label: 'oll', short: 'oll', group: null });
  else plan.push({ key: 'eo', label: 'eo', short: 'eo', group: 'oll' }, { key: 'co', label: 'co', short: 'co', group: 'oll' });
  if (settings.pll === '1look') plan.push({ key: 'pll', label: 'pll', short: 'pll', group: null });
  else plan.push({ key: 'cp', label: 'cp', short: 'cp', group: 'pll' }, { key: 'ep', label: 'ep', short: 'ep', group: 'pll' });
  return plan;
}

export const planKey = plan => plan.map(s => s.key).join(',');

/** Group headers for the timeline: consecutive stages sharing a group. */
export function planGroups(plan, settings = {}) {
  const groups = [];
  plan.forEach((stage, i) => {
    if (!stage.group) return;
    const last = groups[groups.length - 1];
    if (last && last.id === stage.group && last.to === i - 1) { last.to = i; return; }
    const sub = stage.group === 'f2l' ? (settings.f2l === 'pseudo' ? 'pseudo' : '') : '2-look';
    groups.push({ id: stage.group, label: stage.group, sub, from: i, to: i });
  });
  return groups;
}

// Typical share of a CFOP solve per stage (sums to 1 over a full 2-look plan);
// used to size the timeline before there is any history.
const DEFAULT_SHARE = {
  cross: 0.15, pair1: 0.12, pair2: 0.12, pair3: 0.12, pair4: 0.12,
  eo: 0.06, co: 0.1, oll: 0.14, cp: 0.1, ep: 0.1, pll: 0.18,
  fb: 0.28, sb: 0.34, cmll: 0.16, l6e: 0.22,
};
const DEFAULT_TPS = 4;
export const DEFAULT_SOLVE_MS = 20000;

// Legacy records only have coarse phases; map them onto stage keys.
function phaseShare(record, key) {
  const p = record.phases;
  if (!p) return null;
  const f = v => (Number.isFinite(v) ? v : null);
  switch (key) {
    case 'cross': case 'fb': return f(p.crossMs);
    case 'sb': return f(p.f2lMs);
    case 'pair1': case 'pair2': case 'pair3': case 'pair4': return f(p.f2lMs) == null ? null : p.f2lMs / 4;
    case 'oll': case 'cmll': return f(p.ollMs);
    case 'eo': return f(p.ollMs) == null ? null : p.ollMs * 0.4;
    case 'co': return f(p.ollMs) == null ? null : p.ollMs * 0.6;
    case 'pll': case 'l6e': return f(p.pllMs);
    case 'cp': case 'ep': return f(p.pllMs) == null ? null : p.pllMs / 2;
    default: return null;
  }
}

const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/**
 * Per-stage averages over the last `window` records:
 * { [key]: { avgMs, avgMoves, source:'history'|'default' } } plus totalAvgMs.
 * Splits recorded by Brain v2 are used first, then legacy phases, then
 * default shares of the typical solve time.
 */
export function stageAverages(records = [], plan, { window = 50 } = {}) {
  const recent = records.filter(r => r && r.solved !== false).slice(-window);
  const solveTimes = recent.map(r => r.solveMs).filter(Number.isFinite);
  const typical = solveTimes.length ? mean(solveTimes) : DEFAULT_SOLVE_MS;
  const planShare = plan.reduce((sum, s) => sum + (DEFAULT_SHARE[s.key] ?? 0.1), 0) || 1;
  const byKey = {};
  for (const stage of plan) {
    const fromSplits = recent.map(r => r.splits?.find(s => s.key === stage.key)).filter(s => s && Number.isFinite(s.ms));
    let avgMs = null; let avgMoves = null; let source = 'default';
    if (fromSplits.length) {
      avgMs = mean(fromSplits.map(s => s.ms));
      const moves = fromSplits.map(s => s.moves).filter(Number.isFinite);
      avgMoves = moves.length ? mean(moves) : null;
      source = 'history';
    } else {
      const fromPhases = recent.map(r => phaseShare(r, stage.key)).filter(Number.isFinite);
      if (fromPhases.length) { avgMs = mean(fromPhases); source = 'history'; }
    }
    if (avgMs == null) avgMs = typical * ((DEFAULT_SHARE[stage.key] ?? 0.1) / planShare);
    if (avgMoves == null) avgMoves = (avgMs / 1000) * DEFAULT_TPS;
    byKey[stage.key] = { avgMs, avgMoves, source };
  }
  const totalAvgMs = plan.reduce((sum, s) => sum + byKey[s.key].avgMs, 0);
  return { byKey, totalAvgMs };
}

/** Best (lowest) recorded split per stage key, ignoring skips. */
export function pbSplits(records = [], plan) {
  const out = {};
  for (const stage of plan) {
    const values = records.map(r => r?.splits?.find(s => s.key === stage.key)).filter(s => s && !s.skipped && Number.isFinite(s.ms)).map(s => s.ms);
    out[stage.key] = values.length ? Math.min(...values) : null;
  }
  return out;
}
