// Read existing stores without migrating or rewriting their keys. Historical
// aggregates have no attempt dates: display them as all-time figures, never
// pretend that a period filter can reconstruct their missing history.
import { loadLearning } from '../learning.js';
import { loadSolves } from '../solve-store.js';
import { ao12, phaseSplits, scopeStats } from '../solve-metrics.js';

const DAY = 86_400_000;
const read = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } };
const array = value => Array.isArray(value) ? value : [];
const positive = n => Number.isFinite(n) && n >= 0;
const timestamp = value => Number.isFinite(value) ? value : typeof value === 'string' ? Date.parse(value) : NaN;
const dated = value => array(value).filter(row => row && typeof row === 'object').map(row => ({ ...row, at: timestamp(row.at) }));
const count = n => positive(n) ? Math.floor(n) : 0;
const median = values => {
  const sorted = values.filter(positive).sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null;
};
const aliases = { corner: 'corners', scout: 'cross', 'cross-planning': 'cross', 'cross planning': 'cross', 'oll-recognition': 'oll' };
const drillId = id => aliases[id] ?? id;
const DRILLS = [
  ['corners', 'corner recognition', '#/drills/corners'], ['pll', 'PLL recognition', '#/drills/pll'],
  ['f2l', 'F2L deduction', '#/drills/f2l'], ['cross', 'cross planning', '#/drills/scout'],
  ['oll', 'OLL recognition', '#/drills/oll'], ['lookahead', 'lookahead', '#/drills/lookahead'],
  ['algs', 'alg drills', '#/algs'],
];
const summary = items => {
  const attempts = items.reduce((sum, item) => sum + count(item.attempts), 0);
  const correct = items.reduce((sum, item) => sum + Math.min(count(item.attempts), count(item.correct)), 0);
  return { attempts, correct, accuracy: attempts ? correct / attempts : null, medianMs: median(items.flatMap(item => array(item.times))) };
};
const dayKey = at => {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export function readProgress(storage, { records = null, algorithms = [], source = 'smart', focus = 'speed', session = 'all', days = 30, now = Date.now() } = {}) {
  const periodDays = days === 'all' ? null : Math.max(1, Number(days) || 30);
  const since = periodDays == null ? -Infinity : now - periodDays * DAY;
  const allRecords = records ?? loadSolves(storage);
  const inCohort = r => (source === 'all' || (r.source ?? 'smart') === source)
    && (focus === 'all' || (r.focus ?? 'speed') === focus)
    && (session === 'all' || (r.sessionId ?? null) === session);
  const solves = array(allRecords).filter(r => Number.isFinite(r.at) && r.at >= since && r.at <= now && Number.isFinite(r.solveMs) && inCohort(r)).sort((a, b) => a.at - b.at);
  const previousSolves = periodDays == null ? [] : array(allRecords).filter(r => Number.isFinite(r.at) && r.at >= since - periodDays * DAY && r.at < since && Number.isFinite(r.solveMs) && inCohort(r)).sort((a, b) => a.at - b.at);
  const corner = read(storage, 'cubesight-progress-v2', {});
  const learning = loadLearning(storage);
  const pll = read(storage, 'cubesight-pll-progress-v1', {});
  const scout = dated(read(storage, 'cubesight-scout-practice-v1', []));
  const savedRounds = read(storage, 'cubesight-rounds-v1', []);
  const rounds = dated(Array.isArray(savedRounds) ? savedRounds : savedRounds?.rounds).filter(r => Number.isFinite(r.at) && r.at >= since && r.at <= now);
  const drillLearning = {oll:loadLearning(storage,'cubesight-oll-learning-v1'),lookahead:loadLearning(storage,'cubesight-lookahead-learning-v1')};
  const learned = kind => {
    const items = new Map();
    for(const state of [learning,drillLearning[kind]].filter(Boolean)) {
      for(const [key,item] of Object.entries(state.items)) if(key.startsWith(`${kind}|`)) items.set(key,{...item,learningTrial:state.trial});
    }
    return [...items.values()];
  };
  const isDue = item => item.attempts > 0 && (!item.due || item.due <= now || item.learningTrial >= item.dueTrial);
  const dueLearning = kind => learned(kind).filter(isDue).length;
  const pllItems = Object.values(pll && typeof pll === 'object' ? pll : {}).filter(item => item && typeof item === 'object');
  const lifetime = {
    corners: { attempts: count(corner.attempts), correct: Math.min(count(corner.attempts), count(corner.correct)), accuracy: corner.attempts > 0 ? Math.min(1, count(corner.correct) / corner.attempts) : null, medianMs: median(array(corner.history).filter(r => r.correct === true && !r.skipped).map(r => r.ms)) },
    f2l: summary(learned('f2l')), pll: summary(pllItems),
    cross: { attempts: scout.length, correct: scout.filter(r => /^(found|good|correct|easy)$/.test(r.rating)).length, accuracy: null, medianMs: median(scout.map(r => r.durationMs)) },
    oll: summary(learned('oll')), lookahead: summary(learned('lookahead')), algs: summary(algorithms),
  };
  const due = { corners: dueLearning('corner'), f2l: dueLearning('f2l'), pll: pllItems.filter(item => item.attempts > 0 && item.nextReviewAt > 0 && item.nextReviewAt <= now).length, oll: dueLearning('oll'), lookahead: dueLearning('lookahead'), cross: 0, algs: algorithms.filter(item => item.attempts > 0 && item.due > 0).length };
  const drills = DRILLS.map(([id, title, href]) => {
    const selected = rounds.filter(r => drillId(r.drill) === id).sort((a, b) => a.at - b.at);
    const n = selected.reduce((sum, r) => sum + count(r.n ?? r.total), 0), correct = selected.reduce((sum, r) => sum + Math.min(count(r.n ?? r.total), count(r.correct)), 0);
    const recent = selected.slice(-5).map(r => r.medianMs).filter(positive), older = selected.slice(-10, -5).map(r => r.medianMs).filter(positive);
    return { id, title, href, rounds: selected.length, cases: n, accuracy: n ? correct / n : null, medianMs: median(selected.map(r => r.medianMs)), medianKind: 'round medians', trendMs: recent.length && older.length ? median(recent) - median(older) : null, due: due[id], lifetime: lifetime[id] };
  });
  const activity = new Map();
  const add = (at, kind, n = 1) => {
    if (!Number.isFinite(at) || at < since || at > now) return;
    const key = dayKey(at), row = activity.get(key) ?? { date: key, solves: 0, cases: 0 };
    row[kind] += n; activity.set(key, row);
  };
  for (const r of solves) add(r.at, 'solves');
  const cornerHistory = dated(corner.history).filter(r => Number.isFinite(r.at));
  for (const r of cornerHistory) if (!r.skipped) add(r.at, 'cases');
  for (const r of scout) add(r.at, 'cases');
  for (const item of algorithms) for (const at of array(item.activity)) add(timestamp(at), 'cases');
  for (const r of rounds) {
    const id = drillId(r.drill);
    // These two legacy stores already contain dated case observations.
    if ((id === 'corners' && cornerHistory.length) || (id === 'cross' && scout.length) || (id === 'algs' && algorithms.some(item => array(item.activity).length))) continue;
    add(r.at, 'cases', count(r.n ?? r.total));
  }
  const splitCohort = rows => rows.filter(r => r.source !== 'manual' && r.source !== 'import');
  const phases = phaseSplits(splitCohort(solves));
  const previousPhases = periodDays == null ? null : phaseSplits(splitCohort(previousSolves));
  const phaseDrills = [['cross', 'crossMs', '#/drills/scout'], ['F2L', 'f2lMs', '#/drills/f2l'], ['OLL', 'ollMs', '#/drills/oll'], ['PLL', 'pllMs', '#/drills/pll']];
  const splits = phases ? phaseDrills.map(([label, key, href]) => ({
    key: label === 'cross' ? 'cross' : label,
    label, ms: phases[key], href, samples: phases.samples,
    previousMs: previousPhases?.[key] ?? null,
    previousSamples: previousPhases?.samples ?? 0,
    deltaMs: Number.isFinite(previousPhases?.[key]) ? phases[key] - previousPhases[key] : null,
  })) : [];
  const slowest = splits.length ? Math.max(...splits.map(row => row.ms)) : null;
  return {
    source, focus, session, days, solves, stats: scopeStats(solves),
    trend: solves.map((r, i) => ({ at: r.at, ms: ao12(solves.slice(Math.max(0, i - 11), i + 1)) })),
    drills, due: drills.reduce((sum, row) => sum + row.due, 0),
    splits: splits.map(row => ({ ...row, largest: row.ms === slowest })),
    comparison: {
      label: periodDays == null ? 'all time · no comparison period' : `previous ${periodDays} days`,
      samples: previousPhases?.samples ?? 0,
      available: Boolean(previousPhases),
    },
    activity: [...activity.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
