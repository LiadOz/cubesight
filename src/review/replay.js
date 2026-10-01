import { applyMoves, createSolvedState, parseScramble, sameCubeState } from '../cross-cube.js';

const parseLong = text => {
  const raw = String(text ?? '').trim().replace(/[′’]/g, "'").split(/\s+/).filter(Boolean);
  if (raw.length > 10_000) throw new Error('This replay is too long to load.');
  return raw.flatMap((_, index) => index % 200 === 0 ? parseScramble(raw.slice(index, index + 200).join(' ')) : []);
};

/** Apply arbitrary-length stored input without weakening the parser's scramble limit. */
export function applyMovesInChunks(state, input, chunkSize = 200) {
  const moves = typeof input === 'string' ? input.trim().split(/\s+/).filter(Boolean) : [...(input ?? [])];
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 200) throw new RangeError('Chunk size must be between 1 and 200.');
  let next = state;
  for (let at = 0; at < moves.length; at += chunkSize) next = applyMoves(next, moves.slice(at, at + chunkSize));
  return next;
}

export function stateAfter(record, position) {
  const scramble = parseLong(record.scramble);
  let state = createSolvedState();
  for (let at = 0; at < scramble.length; at += 200) state = applyMoves(state, scramble.slice(at, at + 200));
  return applyMovesInChunks(state, record.solveMoves.slice(0, Math.max(0, position)));
}

export function retryPlan(record, moveIndex = 0) {
  if (!record || !Array.isArray(record.solveMoves) || !record.scramble) throw new Error('This solve does not have a replayable reconstruction.');
  const from = Math.max(0, Math.min(record.solveMoves.length, Math.floor(Number(moveIndex) || 0)));
  const marks = record.analysis?.marks;
  const nextMarks = [marks?.cross, ...(marks?.pairs ?? []), marks?.eo, marks?.co, marks?.cp, marks?.solved]
    .filter(index => Number.isInteger(index) && index + 1 > from).map(index => index + 1);
  const to = nextMarks.length ? Math.min(...nextMarks) : record.solveMoves.length;
  const targetState = stateAfter(record, to);
  return {
    from, to, setup: [...parseLong(record.scramble), ...record.solveMoves.slice(0, from)],
    expected: record.solveMoves.slice(from, to), startState: stateAfter(record, from), targetState,
    best: from === 0 && record.analysis?.cross?.best ? record.analysis.cross.best.split(' ') : null,
  };
}

/** A retry is complete when the same physical position is reached; extra moves are retained for grading. */
export function gradeRetry(plan, attemptMoves = []) {
  let state = plan.startState;
  for (let at = 0; at < attemptMoves.length; at += 200) state = applyMoves(state, attemptMoves.slice(at, at + 200));
  const exact = sameCubeState(state, plan.targetState);
  const par = plan.best?.length || plan.expected.length;
  const efficiency = attemptMoves.length === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100 * Math.exp(-Math.max(0, attemptMoves.length - par) / Math.max(1.5 * par, 1)))));
  return { exact, moves: attemptMoves.length, expectedMoves: plan.expected.length, par, efficiency, label: exact ? (attemptMoves.length <= par ? 'Clean retry' : 'Retry complete') : 'Keep going' };
}

/** Rebuild a full solve for the shared analysis engine after reaching the same stage endpoint. */
export function retryRegradeRecord(record, plan, attemptMoves = []) {
  if (!gradeRetry(plan, attemptMoves).exact) return null;
  const solveMoves = [...attemptMoves, ...record.solveMoves.slice(plan.to)];
  return {
    ...record,
    scramble: [...parseLong(record.scramble), ...record.solveMoves.slice(0, plan.from)].join(' '),
    solveMoves,
    moveCount: solveMoves.length,
    solved: true,
    moveTimes: undefined,
    solveMs: undefined,
    tps: undefined,
  };
}
