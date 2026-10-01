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
