import { readCaseColorSetting } from '../ui/cube/case-color.js';

const finiteOrNull = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function buildDrillViewModel(input = {}) {
  const answers = Array.isArray(input.round?.answers) ? input.round.answers : Array.isArray(input.answers) ? input.answers : [];
  return {
    page: input.page ?? 'hub',
    drill: input.drill ?? null,
    phase: input.phase ?? 'idle',
    display: {
      mode: input.displayMode === 'your cube' ? 'your cube' : 'case',
      caseColor: input.caseColor ?? readCaseColorSetting(),
      topColor: input.topColor ?? null,
      caseSeed: input.caseSeed ?? null,
      orbitShape: input.orbitShape ?? 'open',
    },
    currentCase: input.currentCase ?? null,
    round: input.round ? {
      status: input.round.status ?? 'idle',
      kind: input.round.kind ?? null,
      total: Math.max(0, Math.trunc(Number(input.round.total) || 0)),
      answered: answers.length,
      answers: answers.map(answer => ({ caseId: answer.caseId ?? null, correct: answer.correct === true, ms: finiteOrNull(answer.ms) })),
      combo: Math.max(0, Math.trunc(Number(input.round.combo) || 0)),
      bestCombo: Math.max(0, Math.trunc(Number(input.round.bestCombo) || 0)),
      averageMs: finiteOrNull(input.round.averageMs),
      segments: Array.isArray(input.round.segments) ? input.round.segments.map(segment => ({ key: String(segment.key), state: String(segment.state), weight: Math.max(0, Number(segment.weight) || 0), fill: Math.min(1, Math.max(0, Number(segment.fill) || 0)) })) : [],
    } : null,
    setup: input.setup ? { status: input.setup.status ?? 'idle', moves: Array.isArray(input.setup.moves) ? [...input.setup.moves] : [], index: Math.max(0, Math.trunc(Number(input.setup.index) || 0)) } : null,
  };
}
