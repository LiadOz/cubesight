// Analysis accepts imported reconstructions longer than the interactive
// scramble-entry limit, but keeps parsing bounded and validates every token
// through the same public move parser.
import { applyMoves, createSolvedState, parseScramble } from '../cross-cube.js';

export const MAX_ANALYSIS_MOVES = 10_000;

export function parseAnalysisMoves(input = '') {
  const text = typeof input === 'string' ? input : (input || []).join(' ');
  const raw = text.trim().replace(/[′’]/g, "'").split(/\s+/).filter(Boolean);
  if (raw.length > MAX_ANALYSIS_MOVES) throw new Error(`Review is limited to ${MAX_ANALYSIS_MOVES} setup moves.`);
  const moves = [];
  for (let at = 0; at < raw.length; at += 200) {
    moves.push(...parseScramble(raw.slice(at, at + 200).join(' ')));
  }
  return moves;
}

export function applyAnalysisMoves(state, moves) {
  let current = state;
  for (let at = 0; at < moves.length; at += 200) current = applyMoves(current, moves.slice(at, at + 200));
  return current;
}

export function analysisStateFromScramble(scramble) {
  return applyAnalysisMoves(createSolvedState(), parseAnalysisMoves(scramble));
}
