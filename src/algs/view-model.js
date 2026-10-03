import { groupMoves } from '../moves/triggers.js';
import { readCaseColorSetting } from '../ui/cube/case-color.js';

const finiteNonnegative = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const isLocalRouteHash = value => typeof value === 'string' && value.startsWith('#/') && !value.startsWith('#//')
  && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

export function parseAlgRouteContext(hash = '') {
  const query = String(hash).split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const from = params.get('from');
  const localFrom = isLocalRouteHash(from) ? from : null;
  return {
    from: localFrom,
    usedAlg: params.get('usedAlg') || null,
    recognitionMs: finiteNonnegative(params.get('recognitionMs')),
    executionMs: finiteNonnegative(params.get('executionMs')),
  };
}

export function buildAlgViewModel(input = {}) {
  const playback = input.playback ?? {};
  const context = input.context ?? {};
  return {
    page: input.caseId ? 'case' : 'browser',
    route: String(input.route ?? ''),
    set: input.set ?? null,
    caseId: input.caseId ?? null,
    display: {
      mode: input.displayMode === 'your cube' ? 'your cube' : 'case',
      caseColor: input.caseColor ?? readCaseColorSetting(),
      topColor: input.topColor ?? 'yellow',
    },
    selectedAlg: input.selectedAlg ?? null,
    algorithms: Array.isArray(input.algorithms) ? input.algorithms.map(row => ({ id: row.id, moves: row.moves, verified: row.verified === true })) : [],
    playback: {
      index: Math.max(0, Math.trunc(Number(playback.index) || 0)),
      moveCount: Math.max(0, Math.trunc(Number(playback.moveCount) || 0)),
      playing: Boolean(playback.playing),
      speed: Number.isFinite(Number(playback.speed)) ? Number(playback.speed) : 1,
      groups: Array.isArray(playback.groups) ? playback.groups.map(group => ({ label: String(group.label ?? ''), start: group.start, end: group.end })) : [],
    },
    drill: input.drill ? {
      mode: input.drill.mode ?? 'self', phase: input.drill.phase ?? 'ready',
      attempt: Math.max(0, Math.trunc(Number(input.drill.attempt) || 0)),
      moveCount: Math.max(0, Math.trunc(Number(input.drill.moveCount) || 0)),
      match: input.drill.match?.status ?? null,
      executionMs: finiteNonnegative(input.drill.executionMs),
    } : null,
    context: {
      from: context.from ?? null,
      usedAlg: context.usedAlg ?? null,
      recognitionMs: finiteNonnegative(context.recognitionMs),
      executionMs: finiteNonnegative(context.executionMs),
    },
  };
}

export function buildAlgOrbitSegments(moves, index = 0) {
  const list = Array.isArray(moves) ? moves : [];
  const triggers = new Map(groupMoves(list).map(([start, end, label]) => [start, { start, end, label }]));
  const spans = [];
  for (let at = 0; at < list.length;) {
    const trigger = triggers.get(at);
    if (trigger) { spans.push(trigger); at = trigger.end + 1; continue; }
    const start = at++;
    while (at < list.length && !triggers.has(at)) at++;
    spans.push({ start, end: at - 1, label: 'moves' });
  }
  return spans.map(({ start, end, label }, part) => ({
    key: `part-${part}`, label, short: label, weight: end - start + 1,
    state: index > end ? 'done' : index >= start ? 'current' : 'future',
    fill: index <= start ? 0 : index > end ? 1 : (index - start) / (end - start + 1),
  }));
}
