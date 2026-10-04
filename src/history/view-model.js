import { ao5, ao12, isDnf, resultMs } from '../solve-metrics.js';
import { listSessions } from '../store/sessions.js';
import { focusOf, inStatsSource } from '../store/focus.js';
import { deltaTone, fmtDelta, fmtResult, fmtTime } from '../brain/format.js';
import { buildMarkers } from '../brain/review/markers.js';
import { buildStagePlan } from '../brain/stage-plan.js';
import { normalizeSettings } from '../brain/settings.js';
import { filterHistory } from './cstimer.js';

// A-07 labels the 17:33 session "evening".
const DAY_PART = hour => hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
const clockTime = at => {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
const chronological = records => [...records].sort((a, b) => a.at - b.at);
const finiteTimes = values => Array.isArray(values) && values.length > 0
  && values.every((value, index) => Number.isFinite(value) && value >= 0 && (!index || value >= values[index - 1]));

/** Parse history-owned routes. `at` is the stable timestamp key used by storage. */
export function parseHistoryRoute(hash = '') {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const path = raw.split('?')[0].replace(/\/$/, '') || '/history';
  if (path === '/history') return { kind: 'list', at: null, marker: null, path };
  if (path === '/history/import') return { kind: 'import', at: null, marker: null, path };
  const match = path.match(/^\/history\/(\d+)(?:\/(replay|review\/([^/]+)))?$/);
  if (!match) return { kind: 'not-found', at: null, marker: null, path };
  let marker = null;
  try { marker = match[3] ? decodeURIComponent(match[3]) : null; } catch { return { kind: 'not-found', at: null, marker: null, path }; }
  return {
    kind: match[2] === 'replay' ? 'replay' : match[2]?.startsWith('review/') ? 'review' : 'past',
    at: Number(match[1]), marker, path,
  };
}

export const historyPath = at => `/history/${encodeURIComponent(String(at))}`;
export const replayPath = at => `${historyPath(at)}/replay`;
export const historyReviewPath = (at, marker) => `${historyPath(at)}/review/${encodeURIComponent(String(marker))}`;
export const historyReviewHref = (at, marker) => marker
  ? `#${historyReviewPath(at, marker)}`
  : `#${historyPath(at)}`;

/**
 * Stable, JSON-safe model for the session timeline, selected solve and replay.
 * `now` is injected so fixture snapshots do not depend on wall-clock time.
 */
export function buildHistoryViewModel({ records = [], route = { kind: 'list' }, filters = {}, selectedAt = null, move = 0, speed = 1, playing = false, now = 0, settings = normalizeSettings(), results = null } = {}) {
  filters = {
    query: String(filters.query ?? ''), session: String(filters.session ?? 'all'),
    focus: String(filters.focus ?? 'all'), source: String(filters.source ?? 'all'),
  };
  const all = chronological(records);
  const focusRecords = all.filter(record => filters.focus === 'all' || focusOf(record) === filters.focus);
  const filtered = filterHistory(all, filters);
  const visible = [...filtered].sort((a, b) => b.at - a.at);
  const active = (route.at != null ? all.find(record => record.at === route.at) : visible.find(record => record.at === selectedAt)) ?? null;
  const statsSource = settings.stats?.source || 'smart';
  const currentFocusRecords = inStatsSource(focusRecords, statsSource);
  const finite = currentFocusRecords.filter(record => Number.isFinite(resultMs(record)));
  const pb = finite.reduce((best, record) => !best || resultMs(record) < resultMs(best) ? record : best, null);
  const rowContext = rowContextFor({ all, filtered, statsSource, settings });
  const summaries = listSessions(filtered).map(session => {
    const solves = chronological(filtered.filter(record => (record.sessionId ?? `s${record.at}`) === session.id));
    const first = solves[0];
    const date = new Date(session.firstAt);
    const scoped = inStatsSource(solves.filter(record => focusOf(record) === session.focus), statsSource);
    const latest12 = ao12(scoped);
    const recent5 = ao5(scoped);
    return {
      id: session.id, focus: session.focus, firstAt: session.firstAt, lastAt: session.lastAt,
      count: solves.length, period: DAY_PART(date.getHours()), startTime: clockTime(session.firstAt),
      ao12: fmtTime(latest12), ao5: fmtTime(recent5), solves: [...solves].reverse().map(record => cardModel(record, pb, rowContext)),
      lastTime: clockTime(session.lastAt),
      firstSolveAt: first?.at ?? session.firstAt,
    };
  }).sort((a, b) => b.firstAt - a.firstAt);
  const elapsedMs = active?.solveMs ?? 0;
  const moves = Array.isArray(active?.solveMoves) ? active.solveMoves : [];
  const timed = finiteTimes(active?.moveTimes) && active.moveTimes.length === moves.length;
  const requestedMove = route.kind === 'replay' ? move : moves.length;
  const boundedMove = Math.max(0, Math.min(moves.length, Math.floor(Number(requestedMove) || 0)));
  const lastTime = timed ? active.moveTimes.at(-1) : elapsedMs;
  const replayDurationMs = Math.max(0, Number(lastTime) || 0);
  const mark = active?.analysis?.marks ?? {};
  const stageEnds = stageEndsFor(active, mark, moves.length);
  const analysis = active?.analysis ? {
    ...active.analysis,
    marks: { ...(active.analysis.marks || {}), pairs: Array.isArray(active.analysis.marks?.pairs) ? active.analysis.marks.pairs : [] },
    skips: Array.isArray(active.analysis.skips) ? active.analysis.skips : [],
    pseudo: Array.isArray(active.analysis.pseudo) ? active.analysis.pseudo : [],
    pauses: Array.isArray(active.analysis.pauses) ? active.analysis.pauses : [],
    cancels: Array.isArray(active.analysis.cancels) ? active.analysis.cancels : [],
    pairs: Array.isArray(active.analysis.pairs) ? active.analysis.pairs : [],
  } : null;
  const markerRecord = active && analysis ? { ...active, analysis } : active;
  const markers = active ? buildMarkers({ record: markerRecord, stages: active.splits || [], plan: buildStagePlan(settings), focus: focusOf(active), crossColor: settings.crossColor }).markers : [];
  return {
    screen: route.kind === 'list' || route.kind === 'import' ? 'history' : route.kind === 'past' ? 'past-solve' : route.kind === 'review' ? 'review-detail' : 'replay',
    route: { kind: route.kind || 'list', path: route.path || '/history', at: route.at ?? null, marker: route.marker ?? null },
    filters: { query: filters.query || '', session: filters.session || 'all', focus: filters.focus || 'all', source: filters.source || 'all', statsSource },
    summary: {
      count: filtered.length, focus: filters.focus || 'all', pb: fmtResult(pb),
      ao5: fmtTime(ao5(currentFocusRecords)), ao12: fmtTime(ao12(currentFocusRecords)),
    },
    sessions: summaries,
    results,
    selected: active ? {
      at: active.at, result: fmtResult(active), solveMs: active.solveMs, penalty: active.penalty ?? null,
      focus: focusOf(active), source: active.source ?? 'smart', moveCount: active.moveCount ?? moves.length,
      analysis,
      sessionId: active.sessionId ?? null, scramble: active.scramble || active.scrambleTurns?.join(' ') || '', case: active.pllCase ?? active.ollCase ?? null,
      hasReplay: Boolean(moves.length && (active.scramble || active.scrambleTurns?.length)), hasTiming: timed,
      timingLabel: timed ? '' : 'timing not recorded', moveCountTotal: moves.length,
      move: boundedMove, elapsedMs: timed ? (boundedMove ? active.moveTimes[boundedMove - 1] : 0) : replayDurationMs * (moves.length ? boundedMove / moves.length : 0),
      durationMs: replayDurationMs, speed: clampSpeed(speed), playing: route.kind === 'replay' && Boolean(playing),
      stages: stageEnds, rotationMarks: Array.isArray(active.rotationMarks) ? active.rotationMarks : [],
      markers,
    } : null,
    now,
  };
}

// Everything a list row needs besides the record itself: its number, its delta against the ao12 before
// it, its two most telling moments and how each stage compares with the user's own average.
function rowContextFor({ all, filtered, statsSource, settings }) {
  const numbers = new Map(chronological(filtered).map((record, index) => [record.at, index + 1]));
  const scoped = focus => inStatsSource(all.filter(record => focusOf(record) === focus), statsSource);
  const scopes = new Map();
  const scopeOf = record => {
    const focus = focusOf(record);
    if (!scopes.has(focus)) scopes.set(focus, scoped(focus));
    return scopes.get(focus);
  };
  const stageAverage = new Map();
  for (const record of all) for (const split of record.splits ?? []) {
    if (split.skipped || !(split.ms > 0)) continue;
    const entry = stageAverage.get(split.key) ?? { sum: 0, count: 0 };
    entry.sum += split.ms; entry.count++; stageAverage.set(split.key, entry);
  }
  return { numbers, scopeOf, stageAverage, settings, plan: buildStagePlan(settings) };
}

const momentCache = new WeakMap();
/** The two moments that matter most in a solve, as the A-07 row annotations ("EO skip", "slow pair 4"). */
function rowMoments(record, context) {
  if (!record.analysis) return [];
  if (momentCache.has(record)) return momentCache.get(record);
  let chips = [];
  try {
    const { markers } = buildMarkers({ record, stages: record.splits || [], plan: context.plan, focus: focusOf(record), crossColor: context.settings.crossColor });
    chips = [...markers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 2).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
      .map(marker => ({ label: String(marker.label || ''), tone: marker.tone === 'good' ? 'good' : 'bad' })).filter(chip => chip.label);
  } catch { chips = []; }
  momentCache.set(record, chips);
  return chips;
}

/** Result against the ao12 of the solves just before it (the ao5 while there are fewer than twelve). */
function deltaFor(record, context) {
  const own = resultMs(record);
  if (!Number.isFinite(own)) return null;
  const scope = context.scopeOf(record);
  const index = scope.findIndex(item => item.at === record.at);
  if (index < 1) return null;
  const before = scope.slice(Math.max(0, index - 12), index);
  const reference = before.length >= 12 ? ao12(before) : before.length >= 5 ? ao5(before.slice(-5)) : null;
  if (!Number.isFinite(reference)) return null;
  const delta = own - reference;
  return { ms: delta, text: fmtDelta(delta), tone: deltaTone(delta) };
}

function cardModel(record, pb, context) {
  const ms = resultMs(record);
  const isPb = Number.isFinite(ms) && Number.isFinite(resultMs(pb)) && ms === resultMs(pb);
  const average = key => { const entry = context.stageAverage.get(key); return entry ? entry.sum / entry.count : null; };
  const delta = context ? deltaFor(record, context) : null;
  return {
    at: record.at, href: historyPath(record.at), result: fmtResult(record), penalty: record.penalty ?? null,
    solveMs: record.solveMs, focus: focusOf(record), source: record.source ?? 'smart',
    moveCount: record.moveCount ?? record.solveMoves?.length ?? 0, pb: isPb, dnf: isDnf(ms),
    number: context?.numbers.get(record.at) ?? null, delta, moments: context ? rowMoments(record, context) : [],
    segments: Array.isArray(record.splits) ? record.splits.map((split, index) => {
      // Teal when the stage beat the user's own average by 5 %, amber when it ran 8 % over, ivory otherwise.
      const mean = average(split.key);
      const relative = mean && split.ms > 0 ? split.ms / mean : 1;
      const state = split.skipped ? 'skipped' : relative <= 0.95 ? 'good' : relative >= 1.08 ? 'wrong' : 'done';
      return {
        key: String(split.key || `stage-${index}`), weight: Math.max(1, Number(split.ms) || 1),
        state, fill: 1,
        label: split.label || split.short || split.key || '', value: Number.isFinite(split.ms) ? (split.ms / 1000).toFixed(2) : '',
        ...(split.skipped ? { marker: 'good' } : {}),
      };
    }) : [],
  };
}

function stageEndsFor(record, marks, moveCount) {
  if (!record) return [];
  const map = [
    ['cross', marks.cross], ['pair1', marks.pairs?.[0]], ['pair2', marks.pairs?.[1]],
    ['pair3', marks.pairs?.[2]], ['pair4', marks.pairs?.[3]], ['eo', marks.eo],
    ['co', marks.co], ['cp', marks.cp], ['ep', marks.solved],
  ];
  const markEnds = map.filter(([, end]) => Number.isInteger(end) && end >= 0 && end < moveCount)
    .map(([key, end]) => ({ key, start: 0, end: end + 1 }));
  const stages = Array.isArray(record.splits) ? record.splits : [];
  if (!markEnds.length && stages.length) {
    let at = 0;
    return stages.map((stage, i) => {
      const start = at;
      at += Math.max(0, Number(stage.moves) || 0);
      return { key: String(stage.key || `stage-${i}`), start, end: Math.min(moveCount, at), skipped: Boolean(stage.skipped) };
    });
  }
  let start = 0;
  return markEnds.map(stage => {
    const item = { ...stage, start, skipped: Boolean(stages.find(s => s.key === stage.key)?.skipped) };
    start = stage.end;
    return item;
  });
}

function clampSpeed(value) {
  return [0.5, 1, 2].includes(Number(value)) ? Number(value) : 1;
}
