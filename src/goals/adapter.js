// Local-only goal and weekly report calculations. Keep this API independent
// of the progress page so future Orbit views can consume the same data.
import { ao12, resultMs } from '../solve-metrics.js';
import { inFocus, inStatsSource } from '../store/focus.js';

const GOAL_KEY = 'cubesight-goal-v1';
const finite = value => Number.isFinite(value);
const readJson = (storage, key) => {
  try { return JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return null; }
};

export function readGoal(storage = globalThis.localStorage) {
  const value = readJson(storage, GOAL_KEY);
  if (!value || value.metric !== 'ao12' || !finite(value.targetSeconds) || value.targetSeconds <= 0) return null;
  return {
    metric: 'ao12', targetSeconds: value.targetSeconds,
    baselineSeconds: finite(value.baselineSeconds) && value.baselineSeconds > value.targetSeconds ? value.baselineSeconds : null,
    createdAt: finite(value.createdAt) ? value.createdAt : 0,
  };
}

export function saveGoal(storage = globalThis.localStorage, { targetSeconds, baselineSeconds = null, createdAt = Date.now() } = {}) {
  const target = Number(targetSeconds), baseline = Number(baselineSeconds);
  if (!finite(target) || target <= 0) throw new TypeError('Goal target must be a positive number of seconds.');
  const goal = { metric: 'ao12', targetSeconds: target, baselineSeconds: finite(baseline) && baseline > target ? baseline : null, createdAt };
  storage?.setItem(GOAL_KEY, JSON.stringify(goal));
  return goal;
}

export function clearGoal(storage = globalThis.localStorage) { storage?.removeItem(GOAL_KEY); }

/** Progress is measured from the ao12 when the goal was set. Without one, report target proximity. */
export function goalProgress(goal, currentAo12) {
  if (!goal || !finite(goal.targetSeconds) || !finite(currentAo12) || currentAo12 <= 0) return { mode: 'waiting', currentSeconds: finite(currentAo12) ? currentAo12 : null, targetSeconds: goal?.targetSeconds ?? null, percent: null, reached: false };
  const baseline = finite(goal.baselineSeconds) && goal.baselineSeconds > goal.targetSeconds ? goal.baselineSeconds : null;
  const percent = baseline
    ? Math.max(0, Math.min(100, ((baseline - currentAo12) / (baseline - goal.targetSeconds)) * 100))
    : Math.max(0, Math.min(100, (goal.targetSeconds / currentAo12) * 100));
  return { mode: baseline ? 'progress' : 'proximity', currentSeconds: currentAo12, targetSeconds: goal.targetSeconds, baselineSeconds: baseline, percent, reached: currentAo12 <= goal.targetSeconds };
}

function localStartOfWeek(now, weekStartsOn = 1) {
  const date = new Date(now); date.setHours(0, 0, 0, 0);
  const firstDay = ((Number(weekStartsOn) || 0) % 7 + 7) % 7;
  date.setDate(date.getDate() - ((date.getDay() - firstDay + 7) % 7));
  return date;
}

/**
 * Summarize local data for the calendar week (Monday through Sunday).
 * Input: { solves: [{at, solveMs, splits?}], rounds: [{at, n|total, correct, drill}] }.
 */
export function buildWeeklyReport({ solves = [], rounds = [] } = {}, { now = Date.now(), weekStartsOn = 1, source = 'smart', focus = 'speed' } = {}) {
  const startDate = localStartOfWeek(now, weekStartsOn), endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  const start = startDate.getTime(), end = endDate.getTime();
  const inWeek = row => row && finite(row.at) && row.at >= start && row.at < end && row.at <= now;
  const cohort = rows => inStatsSource(focus === 'all' ? rows : inFocus(rows, focus), source);
  const weeklySolves = cohort(solves.filter(inWeek)).filter(row => resultMs(row) !== null).sort((a, b) => a.at - b.at);
  // Drill rounds have no solve source or session focus; report all local
  // practice activity alongside the filtered solve cohort.
  const weeklyRounds = rounds.filter(inWeek);
  const currentAo12 = ao12(weeklySolves);
  const earlier = weeklySolves.filter(row => row.at < now).sort((a, b) => a.at - b.at);
  const later = earlier.slice(Math.floor(earlier.length / 2));
  const earlierHalf = earlier.slice(0, Math.floor(earlier.length / 2));
  const mean = rows => rows.length ? rows.reduce((sum, row) => sum + row.solveMs, 0) / rows.length : null;
  const splitTotals = rows => {
    const values = new Map();
    for (const row of rows) for (const split of Array.isArray(row.splits) ? row.splits : []) {
      if (!split || typeof split.key !== 'string' || !finite(split.ms) || split.ms < 0) continue;
      const current = values.get(split.key) ?? { key: split.key, ms: 0, count: 0 };
      current.ms += split.ms; current.count++; values.set(split.key, current);
    }
    return values;
  };
  const splitBefore = splitTotals(earlierHalf), splitAfter = splitTotals(later);
  const improvedMost = [...splitBefore.keys()].flatMap(key => {
    const before = splitBefore.get(key), after = splitAfter.get(key);
    if (!after?.count) return [];
    const changeMs = after.ms / after.count - before.ms / before.count;
    return changeMs < 0 ? [{ key, changeMs, beforeMs: before.ms / before.count, afterMs: after.ms / after.count }] : [];
  }).sort((a, b) => a.changeMs - b.changeMs)[0] ?? null;
  return {
    start, end, solves: weeklySolves.length,
    ao12Ms: currentAo12,
    trendMs: earlierHalf.length && later.length && [...earlierHalf, ...later].every(row => Number.isFinite(resultMs(row))) ? mean(later.map(row => ({ solveMs: resultMs(row) }))) - mean(earlierHalf.map(row => ({ solveMs: resultMs(row) }))) : null,
    improvedMost,
    rounds: weeklyRounds.length,
    cases: weeklyRounds.reduce((sum, row) => sum + nonnegativeCount(row.n ?? row.total), 0),
    correct: weeklyRounds.reduce((sum, row) => sum + nonnegativeCount(row.correct), 0),
  };
}

function nonnegativeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export { GOAL_KEY };
