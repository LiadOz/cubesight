import { readCaseColorSetting } from '../ui/cube/case-color.js';

export function buildDrillViewModel(input = {}) {
  const answers = Array.isArray(input.round?.answers) ? input.round.answers : Array.isArray(input.answers) ? input.answers : [];
  return {
    page: input.page ?? 'hub',
    drill: input.drill ?? null,
    phase: input.phase ?? 'idle',
    display: {
      mode: input.displayMode === 'your cube' ? 'your cube' : 'case',
      caseColor: input.caseColor ?? readCaseColorSetting(),
      topColor: input.topColor ?? 'yellow',
    },
    currentCase: input.currentCase ?? null,
    round: input.round ? {
      status: input.round.status ?? 'idle',
      kind: input.round.kind ?? null,
      total: Math.max(0, Math.trunc(Number(input.round.total) || 0)),
      answered: answers.length,
      answers: answers.map(answer => ({ caseId: answer.caseId ?? null, correct: answer.correct === true, ms: Number.isFinite(Number(answer.ms)) ? Number(answer.ms) : null })),
      combo: Math.max(0, Math.trunc(Number(input.round.combo) || 0)),
      bestCombo: Math.max(0, Math.trunc(Number(input.round.bestCombo) || 0)),
      averageMs: Number.isFinite(Number(input.round.averageMs)) ? Number(input.round.averageMs) : null,
    } : null,
    setup: input.setup ? { status: input.setup.status ?? 'idle', moves: Array.isArray(input.setup.moves) ? [...input.setup.moves] : [], index: Math.max(0, Math.trunc(Number(input.setup.index) || 0)) } : null,
  };
}
