export const HISTORY_SEED = {
  version: 1,
  records: [{
    at: 1_000_000,
    scramble: 'R U',
    solveMs: 12_340,
    penalty: null,
    focus: 'speed',
    source: 'smart',
    solved: true,
    solveMoves: ["U'", "R'"],
    moveCount: 2,
  }],
};

export function quickRoundSeed(drill = 'corners', now = Date.now()) {
  return {
    version: 1,
    lastDrill: drill,
    settings: {},
    bestCombos: {},
    days: [],
    round: {
      drill,
      preset: { kind: 'cases', cases: 20 },
      startedAt: now,
      updatedAt: now,
      status: 'active',
      answers: Array.from({ length: 19 }, (_, index) => ({ correct: true, ms: 500, at: now + index, caseId: `fixture-${index + 1}` })),
      combo: 19,
      bestCombo: 19,
    },
  };
}

export function seedHistory(page, records = HISTORY_SEED) {
  return page.addInitScript(value => localStorage.setItem('cubesight-solves-v1', JSON.stringify(value)), records);
}
