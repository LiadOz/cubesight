import { validateSolution } from '../cross-cube.js';
import { bestCompletions } from '../analysis/pair-completion.js';

const OPTIONS = Object.freeze({ maxDepth: 12, timeBudgetMs: 160, maxSolutions: 6 });

/** Search a pin in each possible D-offset start frame, off the UI thread. */
export function pinnedPairCompletions(scramble, { startShifts = [0, 1, 2, 3], options = OPTIONS } = {}) {
  const shifts = startShifts.filter(value => Number.isInteger(value) && value >= 0 && value <= 3);
  if (typeof Worker === 'undefined') {
    const results = [];
    for (const startShift of shifts) {
      try { results.push({ startShift, ...bestCompletions(scramble, { ...options, startShift }) }); } catch { /* Try another frame. */ }
    }
    return Promise.resolve(results);
  }
  return new Promise(resolve => {
    const worker = new Worker(new URL('./pinned-pair-worker.js', import.meta.url), { type: 'module' });
    const id = `${Date.now()}-${Math.random()}`;
    const timeout = setTimeout(() => { worker.terminate(); resolve([]); }, 5000);
    worker.addEventListener('message', event => {
      if (event.data?.id !== id) return;
      clearTimeout(timeout);
      worker.terminate();
      resolve(event.data.results ?? []);
    });
    worker.addEventListener('error', () => { clearTimeout(timeout); worker.terminate(); resolve([]); }, { once: true });
    worker.postMessage({ id, scramble, startShifts: shifts, options });
  });
}

/** Recheck one planner result against the rendered cube model, including D fixes. */
export function pinnedPairMoveList(moves, startShift = 0, goalShift = 0) {
  const startFix = ['', 'D', 'D2', "D'"][startShift] || '';
  const goalFix = ['', 'D', 'D2', "D'"][goalShift] || '';
  return {
    startFix: startFix ? [startFix] : [],
    goalFix: goalFix ? [goalFix] : [],
    moves: Array.isArray(moves) ? moves : String(moves || '').split(/\s+/).filter(Boolean),
  };
}

export async function pinnedPairChoices(setup) {
  const frames = await pinnedPairCompletions(setup.scramble);
  const best = new Map();
  for (const frame of frames) {
    const beforeMoves = [];
    const beforeFrame = pinnedPairMoveList([], frame.startShift, 0);
    beforeMoves.push(...beforeFrame.startFix);
    const before = validateSolution(setup.state, beforeMoves, 'D');
    if (!before.crossSolved) continue;
    if (!Number.isInteger(setup.startShift)) {
      setup.startShift = frame.startShift;
      setup.solvedPairs = frame.solved;
      setup.solvedCount = frame.solved.length;
    }
    for (const candidate of frame.candidates) for (const option of candidate.options) {
      const plan = pinnedPairMoveList(option.tokens, frame.startShift, option.goalShift);
      const after = validateSolution(setup.state, [...plan.moves, ...plan.goalFix], 'D');
      if (!after.crossSolved) continue;
      const preserved = before.pairs.every(pair => after.pairs.some(item => item.cornerId === pair.cornerId && item.edgeId === pair.edgeId));
      if (!preserved) continue;
      const added = after.pairs.filter(pair => !before.pairs.some(item => item.cornerId === pair.cornerId && item.edgeId === pair.edgeId));
      if (!added.length) continue;
      const pair = added[0];
      const choice = { slot: pair.slot, cornerId: pair.cornerId, edgeId: pair.edgeId, moves: plan.moves, weight: option.w, pseudo: option.goalShift !== 0, goalShift: option.goalShift, startShift: frame.startShift };
      const previous = best.get(choice.slot);
      if (!previous || choice.weight < previous.weight || (choice.weight === previous.weight && choice.moves.length < previous.moves.length)) best.set(choice.slot, choice);
    }
  }
  return [...best.values()].sort((a, b) => a.weight - b.weight || a.moves.length - b.moves.length || a.slot.localeCompare(b.slot));
}
