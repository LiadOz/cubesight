import { saveGoal, clearGoal } from '../../src/goals/adapter.js';
import { saveSolves } from '../../src/solve-store.js';

const COUNT_BY_STATE = { unset: 12, insufficient: 6, progress: 12, reached: 12 };
const TIMES_BY_STATE = { unset: 17_000, insufficient: 17_000, progress: 17_000, reached: 14_000 };

/**
 * Seed the progress route through its real legacy-history migration path.
 * Call in a fresh browser context so IndexedDB has not already migrated the
 * local solve blob.
 */
export function seedGoalProgressState(storage, { state = 'unset', now = Date.UTC(2026, 9, 2, 12) } = {}) {
  if (!Object.hasOwn(COUNT_BY_STATE, state)) throw new TypeError(`Unknown goal fixture state: ${state}`);
  const count = COUNT_BY_STATE[state];
  const records = Array.from({ length: count }, (_, index) => ({
    at: now - (count - index) * 60_000,
    focus: 'speed', source: 'smart', solved: true,
    solveMs: TIMES_BY_STATE[state], moveCount: 50,
    splits: [{ key: 'cross', ms: Math.round(TIMES_BY_STATE[state] * 0.2) }],
  }));
  storage.removeItem('cubesight-rounds-v1');
  storage.removeItem('cubesight-goal-v1');
  saveSolves(storage, records);
  if (state === 'insufficient') saveGoal(storage, { targetSeconds: 15, createdAt: now });
  if (state === 'progress' || state === 'reached') saveGoal(storage, { targetSeconds: 15, baselineSeconds: 20, createdAt: now });
  storage.setItem('cubesight-rounds-v1', JSON.stringify([{ at: now - 30_000, drill: 'corners', n: 8, correct: 7 }]));
  return { state, records, goal: state === 'unset' ? null : { targetSeconds: 15, baselineSeconds: state === 'insufficient' ? null : 20 } };
}

export function clearGoalProgressState(storage) {
  clearGoal(storage);
  storage.removeItem('cubesight-solves-v1');
  storage.removeItem('cubesight-rounds-v1');
}
