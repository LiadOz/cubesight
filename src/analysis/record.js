// Turn a stored solve record into the input of the analysis (segmentSolve), or explain why it
// cannot be analysed. Pure. A record qualifies when it has a scramble to replay from solved, the
// whole list of its solve moves (the store keeps the last 200; a longer solve is left alone) and
// was solved. Times are used only when there is one per move.

const FACES = new Set(['U', 'D', 'F', 'B', 'R', 'L']);

/** @returns {{input:Object}|{skip:string}} */
export function analysisInputFromRecord(record) {
  if (!record || typeof record !== 'object') return { skip: 'no-record' };
  // Partial solves and solved DNFs can still contain useful F2L/last-layer
  // captures. Segmentation marks unreached cases as null and keeps reached ones.
  if (typeof record.scramble !== 'string' || !record.scramble.trim()) return { skip: 'no-scramble' };
  const moves = Array.isArray(record.solveMoves) ? record.solveMoves : [];
  if (!moves.length) return { skip: 'no-moves' };
  if (Number.isFinite(record.moveCount) && record.moveCount !== moves.length) return { skip: 'moves-truncated' };
  const times = Array.isArray(record.moveTimes) && record.moveTimes.length === moves.length && record.moveTimes.every(Number.isFinite) ? record.moveTimes : undefined;
  const input = { scramble: record.scramble, moves, ...(times ? { moveTimes: times } : {}), ...(FACES.has(record.crossFace) ? { crossFace: record.crossFace } : {}) };
  return { input };
}
