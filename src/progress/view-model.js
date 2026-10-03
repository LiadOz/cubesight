const time = ms => ms === Infinity ? 'DNF' : Number.isFinite(ms) ? (Math.floor(ms / 10) / 100).toFixed(2) : '—';
const countWord = (value, word) => `${value} ${word}${value === 1 ? '' : 's'}`;
const count = value => Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
const nullableNumber = value => Number.isFinite(value) ? value : null;

function splitSegments(splits, comparison) {
  return splits.map(split => {
    const deltaSeconds = Number.isFinite(split.deltaMs) ? split.deltaMs / 1000 : null;
    const name = String(split.label ?? split.key ?? 'stage');
    const splitTime = nullableNumber(split.ms);
    const samples = count(split.samples);
    const change = deltaSeconds == null ? 'no previous data' : deltaSeconds < 0 ? `${time(Math.abs(split.deltaMs))} s faster` : deltaSeconds > 0 ? `${time(split.deltaMs)} s slower` : 'unchanged';
    return {
      key: String(split.key ?? name),
      label: name,
      value: splitTime == null ? '—' : `${time(splitTime)} s`,
      delta: deltaSeconds,
      weight: splitTime ?? 0,
      state: deltaSeconds == null ? 'future' : deltaSeconds < 0 ? 'good' : deltaSeconds > 0 ? 'bad' : 'done',
      href: typeof split.href === 'string' ? split.href : null,
      samples,
      previousSamples: count(split.previousSamples),
      ariaLabel: `${name} average ${splitTime == null ? 'unavailable' : `${time(splitTime)} seconds`}, ${change}; ${countWord(samples, 'solve')}`,
      comparisonLabel: String(comparison.label ?? 'previous period'),
    };
  });
}

function goalSegment(goal, state) {
  const progress = state?.percent;
  const value = Number.isFinite(progress) ? `${Math.round(progress)}%` : 'waiting';
  return [{
    key: 'ao12-goal', label: 'ao12', value, weight: 1,
    fill: Number.isFinite(progress) ? progress / 100 : 0,
    state: !goal || progress == null ? 'future' : state.reached ? 'good' : 'current',
    ariaLabel: !goal ? 'ao12 goal not set' : Number.isFinite(progress)
      ? `ao12 goal ${Math.round(progress)} percent, ${state.mode === 'progress' ? 'progress from baseline' : 'target proximity'}${state.reached ? ', goal reached' : ''}`
      : `ao12 goal waiting${state.currentSeconds === null ? '' : ', current ao12 unavailable'}`,
  }];
}

/** Pure renderer model for the progress route and the F9 snapshot bridge. */
export function buildProgressViewModel({ filters, data, goal, goalState, weekly, sessions = [], selectedView = 'splits', goalFormError = '', shareStatus = 'share latest solve · PNG' } = {}) {
  const view = selectedView === 'goal' ? 'goal' : 'splits';
  const currentMs = data?.stats?.ao12 === Infinity ? Infinity : nullableNumber(data?.stats?.ao12);
  const goalTarget = nullableNumber(goal?.targetSeconds);
  const hasGoal = goalTarget != null && goalTarget > 0;
  const baselineSeconds = Number.isFinite(goal?.baselineSeconds) && goal.baselineSeconds > goalTarget ? goal.baselineSeconds : null;
  const splits = (Array.isArray(data?.splits) ? data.splits : []).map(split => ({
    key: String(split.key ?? split.label ?? 'stage'), label: String(split.label ?? split.key ?? 'stage'),
    ms: nullableNumber(split.ms), previousMs: nullableNumber(split.previousMs), deltaMs: nullableNumber(split.deltaMs),
    samples: count(split.samples), previousSamples: count(split.previousSamples),
    href: typeof split.href === 'string' ? split.href : null, largest: Boolean(split.largest),
  }));
  const comparison = {
    label: String(data?.comparison?.label ?? 'previous period'),
    available: Boolean(data?.comparison?.available),
    samples: count(data?.comparison?.samples),
  };
  const goalMessage = !hasGoal
    ? 'Set an ao12 target to follow it on this Orbit.'
    : currentMs === Infinity
      ? 'This ao12 is a DNF; finish a clean ao12 to track progress.'
      : goalState?.percent == null
        ? `${Math.min(data?.stats?.timedCount ?? 0, 12)} of 12 timed solves toward ao12.`
        : goalState.mode === 'proximity'
          ? `${Math.round(goalState.percent)}% target proximity · no baseline was captured.`
          : goalState.reached
            ? `Goal reached · ${Math.round(goalState.percent)}% progress from baseline.`
            : `${Math.round(goalState.percent)}% progress from baseline.`;
  const drills = (Array.isArray(data?.drills) ? data.drills : []).map(row => {
    const id = String(row.id ?? 'drill'), title = String(row.title ?? row.id ?? 'drill');
    const rounds = count(row.rounds), cases = count(row.cases), due = count(row.due);
    const accuracy = nullableNumber(row.accuracy), medianMs = nullableNumber(row.medianMs), trendMs = nullableNumber(row.trendMs);
    const lifetime = row.lifetime && typeof row.lifetime === 'object' ? {
      attempts: count(row.lifetime.attempts), correct: count(row.lifetime.correct),
      accuracy: nullableNumber(row.lifetime.accuracy), medianMs: nullableNumber(row.lifetime.medianMs),
    } : null;
    return {
    id, title, href: typeof row.href === 'string' ? row.href : '#/drills', rounds, cases,
    accuracy, medianMs, medianKind: String(row.medianKind ?? 'round medians'),
    trendMs, due, lifetime,
    glyph: {
      key: id, label: title, value: due ? `${due} due` : rounds ? `${rounds} rounds` : '—',
      weight: 1, fill: accuracy ?? (rounds ? 1 : 0),
      state: due ? 'current' : rounds ? 'done' : 'future',
    },
    };
  });
  const weeklyAo12 = weekly?.ao12Ms === Infinity ? Infinity : nullableNumber(weekly?.ao12Ms);
  const weeklyImprovedMost = weekly?.improvedMost && Number.isFinite(weekly.improvedMost.changeMs) ? {
    key: String(weekly.improvedMost.key ?? ''), changeMs: weekly.improvedMost.changeMs,
    beforeMs: nullableNumber(weekly.improvedMost.beforeMs), afterMs: nullableNumber(weekly.improvedMost.afterMs),
  } : null;
  const weeklySummary = [
    countWord(count(weekly?.solves), 'solve'), countWord(count(weekly?.rounds), 'round'), countWord(count(weekly?.cases), 'case'),
    weeklyAo12 != null ? `ao12 ${time(weeklyAo12)}` : null,
    weeklyImprovedMost ? `${weeklyImprovedMost.key} improved ${time(Math.abs(weeklyImprovedMost.changeMs))} s` : null,
  ].filter(Boolean).join(' · ');
  const splitCaption = comparison.available
    ? `Averages from ${countWord(splits[0]?.samples ?? 0, 'solve')} · color and signed change vs ${comparison.label}.`
    : comparison.label === 'all time · no comparison period'
      ? `Stage averages · ${comparison.label}.`
      : 'Stage averages · no previous period data for comparison.';
  const currentTime = currentMs === Infinity ? 'DNF' : Number.isFinite(currentMs) ? `${time(currentMs)} s` : '—';
  const targetTime = hasGoal ? `${goalTarget.toFixed(2)} s` : 'not set';
  const baselineTime = baselineSeconds == null ? null : `${baselineSeconds.toFixed(2)} s`;
  const goalCaption = !hasGoal
    ? 'Set an ao12 target to use this Orbit for goal progress.'
    : currentMs === Infinity
      ? `ao12 DNF · target ${targetTime} · waiting for a clean ao12.`
    : goalState?.percent == null
      ? `ao12 ${currentMs === Infinity ? 'DNF' : time(currentMs)} · target ${targetTime} · ${Math.min(data?.stats?.timedCount ?? 0, 12)} of 12 timed solves.`
      : `ao12 ${time(currentMs)} s · target ${targetTime} · ${goalState.mode === 'progress' ? `baseline ${baselineTime}` : 'target proximity'} · ${Math.round(goalState.percent)}%`;
  const orbitSegments = view === 'goal'
    ? goalSegment(hasGoal ? goal : null, goalState)
    : splitSegments(splits, comparison);
  const sessionModels = (Array.isArray(sessions) ? sessions : []).map(session => ({
    id: String(session.id ?? ''), label: String(session.label ?? ''), focus: String(session.focus ?? 'speed'),
    firstAt: nullableNumber(session.firstAt), lastAt: nullableNumber(session.lastAt), count: count(session.count),
  }));
  const weeklyModel = {
    start: nullableNumber(weekly?.start), end: nullableNumber(weekly?.end), solves: count(weekly?.solves),
    ao12Ms: weeklyAo12,
    trendMs: nullableNumber(weekly?.trendMs),
    improvedMost: weeklyImprovedMost,
    rounds: count(weekly?.rounds), cases: count(weekly?.cases), correct: count(weekly?.correct),
    summary: weeklySummary,
  };
  const trend = (Array.isArray(data?.trend) ? data.trend : []).filter(row => Number.isFinite(row?.ms)).slice(-180);
  const recentSolves = (Array.isArray(data?.solves) ? data.solves : []).filter(row => Number.isFinite(row?.solveMs)).slice(-20);
  const source = ['smart', 'manual', 'all'].includes(filters?.source) ? filters.source : 'smart';
  const focus = ['speed', 'flow', 'learning', 'all'].includes(filters?.focus) ? filters.focus : 'speed';
  const session = typeof filters?.session === 'string' ? filters.session : 'all';
  const days = filters?.days === 'all' ? 'all' : ['7', '30'].includes(String(filters?.days)) ? String(filters.days) : '30';
  return {
    route: '/progress', state: view === 'goal' ? 'goal-progress' : 'split-progress',
    filters: { session, source, focus, days, view }, selectedView: view,
    sessions: sessionModels,
    orbit: {
      label: view === 'goal' ? 'ao12 goal progress' : 'average split by stage',
      shape: 'full', size: 'L', centerClearance: 105, segments: orbitSegments,
    },
    splits, splitCaption,
    charts: {
      ao12: trend.map(row => row.ms),
      recent: recentSolves.map(row => row.solveMs),
      splitCurrent: splits.map(row => row.ms),
      splitPrevious: splits.map(row => row.previousMs),
      splitLabels: splits.map(row => row.label),
    },
    emptySplits: splits.length === 0,
    goal: {
      targetSeconds: hasGoal ? goalTarget : null, baselineSeconds,
      currentSeconds: currentMs === Infinity ? Infinity : Number.isFinite(currentMs) ? currentMs / 1000 : null,
      currentLabel: currentTime, targetLabel: targetTime, baselineLabel: baselineTime,
      mode: ['progress', 'proximity', 'waiting'].includes(goalState?.mode) ? goalState.mode : 'waiting', percent: nullableNumber(goalState?.percent),
      reached: Boolean(goalState?.reached), message: goalMessage, caption: goalCaption, formError: String(goalFormError ?? ''),
    },
    drills, due: count(data?.due), drillCaption: 'Round totals use the selected period. Due cases follow each drill schedule.',
    weekly: weeklyModel, shareStatus: String(shareStatus ?? 'share latest solve · PNG'),
    historyHref: '#/history',
  };
}
